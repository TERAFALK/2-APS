import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

type Op = {
  id: number;
  order_id: number;
  name: string;
  machine_id: number | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
};

const LABEL_W = 160;
const PX_PER_HOUR = 42;
const HOUR = 3600_000;

export default function Gantt() {
  const qc = useQueryClient();
  const { data: ops = [] } = useQuery<Op[]>({ queryKey: ["operations"], queryFn: api.operations });
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });

  const run = useMutation({
    mutationFn: api.runPlan,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operations"] }),
  });
  const lock = useMutation({
    mutationFn: (id: number) => api.lockOperation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operations"] }),
  });

  const dueByOrder = useMemo(() => {
    const m: Record<number, number> = {};
    for (const o of orders) m[o.id] = new Date(o.due_date).getTime();
    return m;
  }, [orders]);

  const scheduled = ops.filter((o) => o.start_time && o.end_time);

  const { min, max } = useMemo(() => {
    const t = scheduled.flatMap((o) => [
      new Date(o.start_time!).getTime(),
      new Date(o.end_time!).getTime(),
    ]);
    if (t.length === 0) return { min: 0, max: 0 };
    const lo = Math.min(...t);
    const hi = Math.max(...t);
    // starta på hel timme, lite luft i slutet
    return { min: Math.floor(lo / HOUR) * HOUR, max: hi + HOUR };
  }, [scheduled]);

  const xOf = (ms: number) => ((ms - min) / HOUR) * PX_PER_HOUR;
  const widthPx = xOf(max);

  // maskinrader (alla maskiner + ev. otilldelad)
  const rows: { id: number | null; name: string }[] = machines.map((m) => ({ id: m.id, name: m.name }));
  if (scheduled.some((o) => o.machine_id == null)) rows.push({ id: null, name: "Otilldelad" });

  const opsByMachine: Record<string, Op[]> = {};
  for (const o of scheduled) (opsByMachine[String(o.machine_id)] ??= []).push(o);

  // tidsaxel-ticks (varje timme gridline, etikett var 4:e timme, dygnsmarkör vid midnatt)
  const ticks: { x: number; label: string | null; day: boolean }[] = [];
  if (widthPx > 0) {
    for (let t = min; t <= max; t += HOUR) {
      const d = new Date(t);
      const isDay = d.getHours() === 0;
      const showHour = d.getHours() % 4 === 0;
      ticks.push({
        x: xOf(t),
        day: isDay,
        label: isDay
          ? d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })
          : showHour
          ? d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
          : null,
      });
    }
  }

  const now = Date.now();
  const showNow = now >= min && now <= max;

  const barClass = (o: Op) => {
    if (o.status === "locked") return "locked";
    if (o.status === "running") return "running";
    const due = dueByOrder[o.order_id];
    if (due && o.end_time && new Date(o.end_time).getTime() > due) return "late";
    return "ok";
  };
  const orderNo = (id: number) => orders.find((o) => o.id === id)?.order_no ?? id;

  return (
    <>
      <div className="page-head">
        <h1>Gantt-planering</h1>
        <button className="btn" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Planerar…" : "▶ Kör planering"}
        </button>
      </div>

      {scheduled.length === 0 ? (
        <div className="empty">
          <div className="icon">🗓️</div>
          <h3>Inget schema ännu</h3>
          <div>
            Skapa order och tryck <strong>Kör planering</strong> så optimerar motorn schemat.
          </div>
        </div>
      ) : (
        <>
          <div className="gantt2">
            <div className="g-canvas" style={{ width: LABEL_W + widthPx }}>
              {/* Header */}
              <div className="g-head">
                <div className="g-rowlabel" style={{ position: "absolute", zIndex: 5, borderBottom: "none" }}>
                  Resurs
                </div>
                {ticks.map((t, i) => (
                  <div
                    key={i}
                    className={"g-tick" + (t.day ? " day" : "")}
                    style={{ left: LABEL_W + t.x }}
                  >
                    {t.label}
                  </div>
                ))}
              </div>

              {/* Rader */}
              {rows.map((row) => (
                <div key={String(row.id)} className="g-row">
                  <div className="g-rowlabel">{row.name}</div>
                  {/* gridlinjer */}
                  {ticks.map((t, i) =>
                    t.label || t.day ? (
                      <div
                        key={i}
                        className={"g-gridline" + (t.day ? " day" : "")}
                        style={{ left: LABEL_W + t.x }}
                      />
                    ) : null
                  )}
                  {/* nu-linje */}
                  {showNow && <div className="g-now" style={{ left: LABEL_W + xOf(now) }} />}
                  {/* staplar */}
                  {(opsByMachine[String(row.id)] ?? []).map((o) => {
                    const s = new Date(o.start_time!).getTime();
                    const e = new Date(o.end_time!).getTime();
                    const left = LABEL_W + xOf(s);
                    const w = Math.max(((e - s) / HOUR) * PX_PER_HOUR, 6);
                    return (
                      <div
                        key={o.id}
                        className={"g-bar " + barClass(o)}
                        style={{ left, width: w }}
                        title={`${orderNo(o.order_id)} · ${o.name}\n${new Date(s).toLocaleString("sv-SE")} – ${new Date(e).toLocaleTimeString("sv-SE")}\nDubbelklick = lås`}
                        onDoubleClick={() => lock.mutate(o.id)}
                      >
                        {orderNo(o.order_id)} · {o.name}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="legend">
            <span><span className="swatch" style={{ background: "#16a34a" }} />I tid</span>
            <span><span className="swatch" style={{ background: "#2563eb" }} />Pågår</span>
            <span><span className="swatch" style={{ background: "#ce0e2d" }} />Försenad</span>
            <span><span className="swatch" style={{ background: "#14171c" }} />Låst</span>
            <span style={{ marginLeft: "auto" }}>💡 Dubbelklicka på en operation för att låsa den.</span>
          </div>

          {/* Ordergrid under tidslinjen (SkyPlanner-stil) */}
          <div className="section">
            <h2>Order i schemat</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ordernr</th><th>Antal</th><th>Prioritet</th>
                    <th>Leveransdatum</th><th>Operationer</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const opsForOrder = scheduled.filter((x) => x.order_id === o.id);
                    const due = new Date(o.due_date).getTime();
                    const late = opsForOrder.some((x) => new Date(x.end_time!).getTime() > due);
                    return (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 600 }}>{o.order_no}</td>
                        <td>{o.quantity}</td>
                        <td>{o.priority}</td>
                        <td style={{ color: late ? "var(--red)" : undefined, fontWeight: late ? 600 : 400 }}>
                          {new Date(o.due_date).toLocaleDateString("sv-SE")}
                        </td>
                        <td>{opsForOrder.length}</td>
                        <td><span className={"badge " + o.status}>{o.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
