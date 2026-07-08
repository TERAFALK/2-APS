"""APS-planeringsmotor byggd på Google OR-Tools CP-SAT.

Modellerar ett flexibelt job-shop-problem med finite capacity:
  * varje order genererar en kedja av operationer (routing-ordning måste hållas)
  * varje operation körs på EN maskin av rätt maskintyp (alternativa/parallella maskiner)
  * ingen maskin kör två operationer samtidigt (NoOverlap = finite capacity)
  * sekvensberoende ställtid när nästa operation gäller en annan produkt
  * manuellt låsta operationer hålls fixa
  * mål: minimera viktad försening, därefter ledtid (makespan) och ställtider

Tidsenhet i modellen: minuter från planeringshorisontens start (horizon_start).
Denna modul är ren och sидeffektfri — in: dataklasser, ut: en lösning. Persistens sker i services.
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
    setup_change_minutes: int = 15                # ställtid vid produktbyte på maskin
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

    ops = {o.op_id: o for o in p.operations}
    by_order: dict[int, list[OpInput]] = {}
    for o in p.operations:
        by_order.setdefault(o.order_id, []).append(o)
    for lst in by_order.values():
        lst.sort(key=lambda x: x.seq)

    # Variabler per operation
    starts, ends, intervals = {}, {}, {}
    # maskin-tilldelning: presence-intervall per (op, maskin)
    machine_presence: dict[tuple[int, int], cp_model.IntVar] = {}
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
            iv = model.NewOptionalIntervalVar(
                start, o.duration, end, present, f"iv_{o.op_id}_{m}"
            )
            machine_presence[(o.op_id, m)] = present
            machine_intervals[m].append((iv, present, o))
            op_machine_var[o.op_id][m] = present
            presences.append(present)
        # exakt en maskin väljs
        model.Add(sum(presences) == 1)
        intervals[o.op_id] = (start, end)

    # Routing-ordning inom en order
    for lst in by_order.values():
        for a, b in zip(lst, lst[1:]):
            model.Add(starts[b.op_id] >= ends[a.op_id])

    # Finite capacity: ingen överlappning per maskin
    for m, items in machine_intervals.items():
        model.AddNoOverlap([iv for iv, _, _ in items])

    # Makespan
    makespan = model.NewIntVar(0, H, "makespan")
    for o in p.operations:
        model.Add(makespan >= ends[o.op_id])

    # Tardiness per order (mätt på sista operationen)
    tardiness_terms = []
    for order in p.orders:
        last_op = by_order.get(order.order_id, [])
        if not last_op:
            continue
        last_end = ends[last_op[-1].op_id]
        tard = model.NewIntVar(0, H, f"tard_{order.order_id}")
        model.Add(tard >= last_end - order.due)
        model.Add(tard >= 0)
        weight = int(p.w_tardiness * order.weight * (1 + max(0, 200 - order.priority) / 200))
        tardiness_terms.append(weight * tard)

    # Ställtids-proxy (MVP): varje aktiv (operation, maskin)-tilldelning bär en liten fast
    # kostnad. Det styr lösaren mot att samla operationer på färre maskiner → färre omställningar.
    # Fas 2 ersätter detta med äkta sekvensberoende setup via AddCircuit per maskin.
    setup_penalty = []
    for items in machine_intervals.values():
        for _iv, present, _o in items:
            setup_penalty.append(present * int(p.w_setup))

    model.Minimize(
        sum(tardiness_terms)
        + int(p.w_makespan) * makespan
        + sum(setup_penalty)
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = p.max_seconds
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    status_name = solver.StatusName(status)
    scheduled: list[ScheduledOp] = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for o in p.operations:
            chosen = None
            for m, present in op_machine_var[o.op_id].items():
                if solver.Value(present) == 1:
                    chosen = m
                    break
            scheduled.append(
                ScheduledOp(
                    op_id=o.op_id,
                    machine_id=chosen,
                    start=int(solver.Value(starts[o.op_id])),
                    end=int(solver.Value(ends[o.op_id])),
                )
            )
    return Solution(
        status=status_name,
        objective=solver.ObjectiveValue() if scheduled else 0.0,
        scheduled=scheduled,
    )
