"""APS-planeringsmotor byggd på Google OR-Tools CP-SAT.

Modellerar ett flexibelt job-shop-problem med finite capacity:
  * varje order genererar en kedja av operationer (routing-ordning måste hållas)
  * varje operation körs på EN maskin av rätt maskintyp (alternativa/parallella maskiner)
  * ingen maskin kör två operationer samtidigt (NoOverlap = finite capacity)
  * maskiner arbetar bara under sina arbetstider och inte under underhåll (downtime-intervall)
  * äkta sekvensberoende ställtid: byte till annan produkt kostar ställtid (circuit per maskin)
  * manuellt låsta operationer hålls fixa
  * mål: minimera viktad försening, därefter ledtid (makespan) och antal omställningar

Tidsenhet i modellen: minuter från planeringshorisontens start (horizon_start).
Modulen är ren och sidoeffektfri — in: dataklasser, ut: en lösning. Persistens sker i services.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ortools.sat.python import cp_model


@dataclass
class OpInput:
    op_id: int
    order_id: int
    seq: int
    product_id: int
    duration: int                    # minuter (setup + run), exkl. sekvensställ
    eligible_machines: list[int]     # maskin-id:n operationen kan köras på
    locked_machine: int | None = None
    locked_start: int | None = None  # minuter från horizon_start, om låst


@dataclass
class OrderInput:
    order_id: int
    due: int          # minuter från horizon_start
    priority: int     # lägre = viktigare
    weight: float = 1.0


@dataclass
class ProblemInput:
    orders: list[OrderInput]
    operations: list[OpInput]
    machines: list[int]
    horizon: int                                  # total planeringshorisont i minuter
    # downtime[machine_id] = lista av (start, slut) i minuter då maskinen INTE är tillgänglig
    # (nätter/helger utanför skift samt underhållsfönster). Byggs i services.
    downtime: dict[int, list[tuple[int, int]]] = field(default_factory=dict)
    setup_change_minutes: int = 15                # ställtid vid produktbyte på en maskin
    # målvikter
    w_tardiness: float = 1000.0
    w_makespan: float = 1.0
    w_setup: float = 5.0
    max_seconds: float = 20.0


@dataclass
class ScheduledOp:
    op_id: int
    machine_id: int
    start: int
    end: int


@dataclass
class Solution:
    status: str
    objective: float
    scheduled: list[ScheduledOp] = field(default_factory=list)


def solve(p: ProblemInput) -> Solution:
    model = cp_model.CpModel()
    H = p.horizon

    by_order: dict[int, list[OpInput]] = {}
    for o in p.operations:
        by_order.setdefault(o.order_id, []).append(o)
    for lst in by_order.values():
        lst.sort(key=lambda x: x.seq)

    starts: dict[int, cp_model.IntVar] = {}
    ends: dict[int, cp_model.IntVar] = {}
    op_by_id = {o.op_id: o for o in p.operations}
    # maskin-tilldelning: presence-literal + intervall per (op, maskin)
    machine_intervals: dict[int, list] = {m: [] for m in p.machines}
    op_machine_var: dict[int, dict[int, cp_model.IntVar]] = {}

    for o in p.operations:
        start = model.NewIntVar(0, H, f"start_{o.op_id}")
        end = model.NewIntVar(0, H, f"end_{o.op_id}")
        starts[o.op_id] = start
        ends[o.op_id] = end

        if o.locked_start is not None:
            model.Add(start == o.locked_start)

        elig = [o.locked_machine] if o.locked_machine else o.eligible_machines
        presences = []
        op_machine_var[o.op_id] = {}
        for m in elig:
            present = model.NewBoolVar(f"op{o.op_id}_m{m}")
            iv = model.NewOptionalIntervalVar(start, o.duration, end, present, f"iv_{o.op_id}_{m}")
            machine_intervals[m].append((iv, present, o))
            op_machine_var[o.op_id][m] = present
            presences.append(present)
        model.Add(sum(presences) == 1)  # exakt en maskin väljs

    # Routing-ordning inom en order
    for lst in by_order.values():
        for a, b in zip(lst, lst[1:]):
            model.Add(starts[b.op_id] >= ends[a.op_id])

    # Downtime: fasta, alltid-närvarande intervall som blockerar maskinen
    for m, windows in p.downtime.items():
        if m not in machine_intervals:
            continue
        for i, (ds, de) in enumerate(windows):
            ds = max(0, min(ds, H))
            de = max(0, min(de, H))
            if de > ds:
                machine_intervals[m].append(
                    (model.NewIntervalVar(ds, de - ds, de, f"down_{m}_{i}"), None, None)
                )

    # Finite capacity: ingen överlappning per maskin
    for items in machine_intervals.values():
        model.AddNoOverlap([iv for iv, _, _ in items])

    # Sekvensberoende ställtid via circuit per maskin.
    setup_count_terms = []
    for m, items in machine_intervals.items():
        real = [(iv, present, o) for iv, present, o in items if present is not None]
        if len(real) < 2:
            continue
        n = len(real)
        # circuit-noder: depot = 0, operationer = 1..n
        arcs = []
        for i in range(1, n + 1):
            _, present_i, _ = real[i - 1]
            arcs.append((i, i, present_i.Not()))                  # inaktiv nod (op på annan maskin)
            arcs.append((0, i, model.NewBoolVar(f"src_{m}_{i}")))  # depot -> i (första på maskinen)
            arcs.append((i, 0, model.NewBoolVar(f"snk_{m}_{i}")))  # i -> depot (sista på maskinen)
        for i in range(1, n + 1):
            _, _, oi = real[i - 1]
            for j in range(1, n + 1):
                if i == j:
                    continue
                _, _, oj = real[j - 1]
                lit = model.NewBoolVar(f"arc_{m}_{i}_{j}")
                arcs.append((i, j, lit))
                setup = 0 if oi.product_id == oj.product_id else p.setup_change_minutes
                # om i kommer direkt före j på maskinen: j startar efter i:s slut + ställtid
                model.Add(starts[oj.op_id] >= ends[oi.op_id] + setup).OnlyEnforceIf(lit)
                if setup > 0:
                    setup_count_terms.append(lit)
        model.AddCircuit(arcs)

    # Makespan
    makespan = model.NewIntVar(0, H, "makespan")
    for o in p.operations:
        model.Add(makespan >= ends[o.op_id])

    # Tardiness per order (mätt på sista operationen), viktat mot prioritet
    tardiness_terms = []
    for order in p.orders:
        chain = by_order.get(order.order_id, [])
        if not chain:
            continue
        last_end = ends[chain[-1].op_id]
        tard = model.NewIntVar(0, H, f"tard_{order.order_id}")
        model.Add(tard >= last_end - order.due)
        weight = int(p.w_tardiness * order.weight * (1 + max(0, 200 - order.priority) / 200))
        tardiness_terms.append(weight * tard)

    model.Minimize(
        sum(tardiness_terms)
        + int(p.w_makespan) * makespan
        + int(p.w_setup) * sum(setup_count_terms)
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = p.max_seconds
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    scheduled: list[ScheduledOp] = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for o in p.operations:
            chosen = next(
                (m for m, present in op_machine_var[o.op_id].items() if solver.Value(present) == 1),
                None,
            )
            scheduled.append(
                ScheduledOp(
                    op_id=o.op_id,
                    machine_id=chosen,
                    start=int(solver.Value(starts[o.op_id])),
                    end=int(solver.Value(ends[o.op_id])),
                )
            )
    return Solution(
        status=solver.StatusName(status),
        objective=solver.ObjectiveValue() if scheduled else 0.0,
        scheduled=scheduled,
    )
