import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

type Op = {
  id: number;
  order_id: number;
  name: string;
  sequence: number;
  machine_id: number | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
};

const LABEL_W = 160;
const PX_PER_HOUR = 42;
const HOUR = 3600_000;
const HEAD_H = 46;
const ROW_H = 46;
const BAR_CENTER = 23;
const SNAP_MIN = 15;

export default function Gantt() {
  const qc = useQueryClient();
  const { data: ops = [] } = useQuery<Op[]>({ queryKey: ["operations"], queryFn: api.operations });
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["operations"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };
  const run = useMutation({ mutationFn: api.runPlan, onSuccess: invalidate });
  const lock = useMutation({ mutationFn: (id: number) => api.lockOperation(id), onSuccess: invalidate });
  const move = useMutation({
    mutationFn: (v: { id: number; start: string; machine: number | null }) =>
      api.moveOperation(v.id, v.start, v.machine),
    onSuccess: invalidate,
  });

  const dueByOrder = useMemo(() => {
    const m: Record<number, number> = {};
    for (const o of orders) m[o.id] = new Date(o.due_date).getTime();
    return m;
  }, [orders]);

  const scheduled = ops.filter((o) => o.start_time && o.end_time);

  const { min, max } = useMemo(() => {
    const t = scheduled.flatMap((o) => [new Date(o.start_time!).getTime(), new Date(o.end_time!).getTime()]);
    if (t.length === 0) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min(...t) / HOUR) * HOUR, max: Math.max(...t) + HOUR };
  }, [scheduled]);

  const xOf = (ms: number) => ((ms - min) / HOUR) * PX_PER_HOUR;
  const widthPx = xOf(max);

  const rows: { id: number | null; name: string }[] = machines.map((m) => ({ id: m.id, name: m.name }));
  if (scheduled.some((o) => o.machine_id == null)) rows.push({ id: null, name: "Otilldelad" });
  const rowIndexOf = (mid: number | null) => rows.findIndex((r) => r.id === mid);

  const opsByMachine: Record<string, Op[]> = {};
  for (const o of scheduled) (opsByMachine[String(o.machine_id)] ??= []).push(o);

  // dependency-kedjor per order (efterföljande operationer)
  const arrows = useMemo(() => {
    const byOrder: Record<number, Op[]> = {};
    for (const o of scheduled) (byOrder[o.order_id] ??= []).push(o);
    const paths: { key: string; d: string }[] = [];
    for (const chain of Object.values(byOrder)) {
      chain.sort((a, b) => a.sequence - b.sequence);
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i], b = chain[i + 1];
        const ri = rowIndexOf(a.machine_id), rj = rowIndexOf(b.machine_id);
        if (ri < 0 || rj < 0) continue;
        const x1 = LABEL_W + xOf(new Date(a.end_time!).getTime());
        const y1 = HEAD_H + ri * ROW_H + BAR_CENTER;
        const x2 = LABEL_W + xOf(new Date(b.start_time!).getTime());
        const y2 = HEAD_H + rj * ROW_H + BAR_CENTER;
        const dx = Math.max(24, Math.abs(x2 - x1) / 2);
        paths.push({ key: `${a.id}-${b.id}`, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` });
      }
    }
    return paths;
  }, [scheduled, rows.length, min]);

  // ticks
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

  // ---------- drag & drop ----------
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ opId: number; startX: number; startY: number; origMs: number; origMachine: number | null } | null>(null);
  const [drag, setDrag] = useState<{ opId: number; dx: number; dy: number } | null>(null);

  function onBarMouseDown(e: React.MouseEvent, o: Op) {
    e.preventDefault();
    dragRef.current = {
      opId: o.id,
      startX: e.clientX,
      startY: e.clientY,
      origMs: new Date(o.start_time!).getTime(),
      origMachine: o.machine_id,
    };
    setDrag({ opId: o.id, dx: 0, dy: 0 });
  }

  useEffect(() => {
    if (!drag) return;
    document.body.classList.add("dragging-active");
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current!;
      setDrag({ opId: d.opId, dx: e.clientX - d.startX, dy: e.clientY - d.startY });
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      document.body.classList.remove("dragging-active");
      if (!d) return;
      const dx = e.clientX - d.startX;
      const deltaMin = Math.round((dx / PX_PER_HOUR) * 60 / SNAP_MIN) * SNAP_MIN;
      const newMs = d.origMs + deltaMin * 60000;
      let machineId = d.origMachine;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const idx = Math.floor((e.clientY - rect.top - HEAD_H) / ROW_H);
        if (idx >= 0 && idx < rows.length && rows[idx].id != null) machineId = rows[idx].id;
      }
      if (Math.abs(dx) > 4 || machineId !== d.origMachine) {
        move.mutate({ id: d.opId, start: new Date(newMs).toISOString(), machine: machineId });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.opId]);

  const canvasH = HEAD_H + rows.length * ROW_H;

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
          <div>Skapa order och tryck <strong>Kör planering</strong> så optimerar motorn schemat.</div>
        </div>
      ) : (
        <>
          <div className="gantt2">
            <div className="g-canvas" ref={canvasRef} style={{ width: LABEL_W + widthPx, height: canvasH }}>
              {/* Header */}
              <div className="g-head">
                <div className="g-rowlabel" style={{ position: "absolute", zIndex: 6, borderBottom: "none" }}>Resurs</div>
                {ticks.map((t, i) => (
                  <div key={i} className={"g-tick" + (t.day ? " day" : "")} style={{ left: LABEL_W + t.x }}>{t.label}</div>
                ))}
              </div>

              {/* Beroendepilar */}
              <svg className="g-arrows" width={LABEL_W + widthPx} height={canvasH}>
                <defs>
                  <marker id="arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="rgba(206,14,45,0.7)" />
                  </marker>
                </defs>
                {arrows.map((a) => (
                  <path key={a.key} d={a.d} markerEnd="url(#arrow)" />
                ))}
              </svg>

              {/* Rader */}
              {rows.map((row, ri) => (
                <div key={String(row.id)} className="g-row" style={{ top: HEAD_H + ri * ROW_H, position: "absolute", left: 0, right: 0 }}>
                  <div className="g-rowlabel">{row.name}</div>
                  {ticks.map((t, i) =>
                    t.label || t.day ? <div key={i} className={"g-gridline" + (t.day ? " day" : "")} style={{ left: LABEL_W + t.x }} /> : null
                  )}
                  {showNow && <div className="g-now" style={{ left: LABEL_W + xOf(now) }} />}
                  {(opsByMachine[String(row.id)] ?? []).map((o) => {
                    const s = new Date(o.start_time!).getTime();
                    const e = new Date(o.end_time!).getTime();
                    const left = LABEL_W + xOf(s);
                    const w = Math.max(((e - s) / HOUR) * PX_PER_HOUR, 6);
                    const isDrag = drag?.opId === o.id;
                    return (
                      <div
                        key={o.id}
                        className={"g-bar " + barClass(o) + (isDrag ? " dragging" : "")}
                        style={{
                          left,
                          width: w,
                          transform: isDrag ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined,
                        }}
                        title={`${orderNo(o.order_id)} · ${o.name}\n${new Date(s).toLocaleString("sv-SE")} – ${new Date(e).toLocaleTimeString("sv-SE")}\nDra för att flytta · dubbelklick = lås`}
                        onMouseDown={(ev) => onBarMouseDown(ev, o)}
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
            <span style={{ marginLeft: "auto" }}>💡 Dra en operation i sidled för att flytta i tid, eller till en annan rad för att byta maskin — schemat planeras om runt låsningen.</span>
          </div>

          <div className="section">
            <h2>Order i schemat</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Ordernr</th><th>Antal</th><th>Prioritet</th><th>Leveransdatum</th><th>Operationer</th><th>Status</th></tr>
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

      {move.isPending && <div className="replan-toast">⟳ Planerar om runt din flytt…</div>}
    </>
  );
}
