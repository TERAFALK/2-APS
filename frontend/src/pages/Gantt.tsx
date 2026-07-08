import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

type Op = {
  id: number; order_id: number; name: string; sequence: number;
  machine_id: number | null; start_time: string | null; end_time: string | null;
  status: string; duration_minutes: number;
};

const LABEL_W = 150;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const HEAD_H = 52;
const ROW_H = 48;
const BAR_CENTER = 24;
const SNAP_MIN = 15;

const parseTime = (s?: string) => {
  if (!s) return { h: 7, m: 0 };
  const [h, m] = s.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
};
const fmtDur = (min: number) => (min >= 60 ? `${(min / 60).toFixed(1)}h` : `${min}m`);

type Drag =
  | { kind: "move"; opId: number; label: string; origMs: number; origMachine: number | null; startX: number; startY: number }
  | { kind: "new"; opId: number; label: string; startX: number; startY: number };

export default function Gantt() {
  const qc = useQueryClient();
  const { data: ops = [] } = useQuery<Op[]>({ queryKey: ["operations"], queryFn: api.operations });
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });

  const [pxph, setPxph] = useState(16);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["operations"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };
  const generate = useMutation({ mutationFn: api.generateMoments, onSuccess: invalidate });
  const schedule = useMutation({
    mutationFn: (v: { id: number; start: string; machine: number | null }) => api.scheduleManual(v.id, v.start, v.machine),
    onSuccess: invalidate,
  });
  const unschedule = useMutation({ mutationFn: (id: number) => api.unscheduleMoment(id), onSuccess: invalidate });

  const dueByOrder = useMemo(() => {
    const m: Record<number, number> = {};
    for (const o of orders) m[o.id] = new Date(o.due_date).getTime();
    return m;
  }, [orders]);
  const machineById = useMemo(() => {
    const m: Record<number, any> = {};
    for (const mc of machines) m[mc.id] = mc;
    return m;
  }, [machines]);
  const orderNo = (id: number) => orders.find((o) => o.id === id)?.order_no ?? id;

  const scheduled = ops.filter((o) => o.start_time && o.end_time);
  const backlog = ops.filter((o) => !o.start_time);

  const { min, days } = useMemo(() => {
    const t = scheduled.flatMap((o) => [new Date(o.start_time!).getTime(), new Date(o.end_time!).getTime()]);
    const base = t.length ? Math.min(...t) : Date.now();
    const lo = new Date(base); lo.setHours(0, 0, 0, 0);
    const hiBase = t.length ? Math.max(...t) : Date.now() + 6 * DAY;
    const hi = new Date(hiBase); hi.setHours(0, 0, 0, 0);
    const dayCount = Math.max(7, Math.round((hi.getTime() - lo.getTime()) / DAY) + 1);
    return { min: lo.getTime(), days: dayCount };
  }, [scheduled]);

  const dayWidth = 24 * pxph;
  const widthPx = days * dayWidth;
  const xOf = (ms: number) => ((ms - min) / HOUR) * pxph;

  const rows: { id: number | null; name: string }[] = machines.map((m) => ({ id: m.id, name: m.name }));
  const rowIndexOf = (mid: number | null) => rows.findIndex((r) => r.id === mid);

  const opsByMachine: Record<string, Op[]> = {};
  for (const o of scheduled) (opsByMachine[String(o.machine_id)] ??= []).push(o);

  const dayList = useMemo(() =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date(min + i * DAY);
      return { i, weekend: d.getDay() === 0 || d.getDay() === 6, date: d };
    }), [min, days]);

  const hourStep = pxph >= 26 ? 2 : pxph >= 13 ? 4 : pxph >= 7 ? 6 : 12;

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
        const dx = Math.max(20, Math.abs(x2 - x1) / 2);
        paths.push({ key: `${a.id}-${b.id}`, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` });
      }
    }
    return paths;
  }, [scheduled, rows.length, min, pxph]);

  const now = Date.now();
  const showNow = now >= min && now <= min + days * DAY;

  const barClass = (o: Op) => {
    if (o.status === "running") return "running";
    const due = dueByOrder[o.order_id];
    if (due && o.end_time && new Date(o.end_time).getTime() > due) return "late";
    return "ok";
  };

  // ---------- drag: backlog → tidslinje, och flytt på tidslinjen ----------
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<(Drag & { dx: number; dy: number; cx: number; cy: number }) | null>(null);

  function startDrag(d: Drag, e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = d;
    setDrag({ ...d, dx: 0, dy: 0, cx: e.clientX, cy: e.clientY });
  }

  useEffect(() => {
    if (!drag) return;
    document.body.classList.add("dragging-active");
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current!;
      setDrag({ ...d, dx: e.clientX - d.startX, dy: e.clientY - d.startY, cx: e.clientX, cy: e.clientY });
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current; dragRef.current = null; setDrag(null);
      document.body.classList.remove("dragging-active");
      if (!d) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      let machineId: number | null = d.kind === "move" ? d.origMachine : null;
      let rowValid = false;
      if (rect) {
        const idx = Math.floor((e.clientY - rect.top - HEAD_H) / ROW_H);
        if (idx >= 0 && idx < rows.length) { machineId = rows[idx].id; rowValid = true; }
      }
      if (d.kind === "move") {
        const dx = e.clientX - d.startX;
        const deltaMin = Math.round((dx / pxph) * 60 / SNAP_MIN) * SNAP_MIN;
        const newMs = d.origMs + deltaMin * 60000;
        if (Math.abs(dx) > 4 || machineId !== d.origMachine) {
          schedule.mutate({ id: d.opId, start: new Date(newMs).toISOString(), machine: machineId });
        }
      } else {
        // ny placering från backlog — kräver träff på en maskinrad
        if (rect && rowValid && machineId != null) {
          const xInCanvas = e.clientX - rect.left - LABEL_W;
          const rawMs = min + (xInCanvas / pxph) * HOUR;
          const snapMs = Math.round(rawMs / (SNAP_MIN * 60000)) * (SNAP_MIN * 60000);
          schedule.mutate({ id: d.opId, start: new Date(snapMs).toISOString(), machine: machineId });
        }
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.opId, drag?.kind]);

  const canvasH = HEAD_H + rows.length * ROW_H;
  const busy = schedule.isPending || unschedule.isPending;

  return (
    <>
      <div className="page-head">
        <h1>Produktionsplanering</h1>
        <div className="gantt-toolbar">
          <button className="iconbtn" title="Zooma ut" onClick={() => setPxph((p) => Math.max(4, Math.round(p / 1.4)))}>−</button>
          <button className="iconbtn" title="Zooma in" onClick={() => setPxph((p) => Math.min(80, Math.round(p * 1.4)))}>+</button>
          <button className="btn secondary" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? "Skapar…" : "＋ Förbered moment"}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="icon">🏭</div>
          <h3>Inga maskiner</h3>
          <div>Lägg upp maskiner under <strong>Grunddata</strong> först.</div>
        </div>
      ) : (
        <>
          {/* Backlog */}
          <div className="backlog">
            <div className="backlog-head">
              <h2 style={{ margin: 0 }}>Moment att planera ({backlog.length})</h2>
              <span className="drop-hint">Dra ett moment till en maskinrad i tidslinjen för att placera det.</span>
            </div>
            {backlog.length === 0 ? (
              <div className="subtle">
                Inga oplanerade moment. Skapa en order (så genereras dess moment) eller tryck <strong>Förbered moment</strong>.
              </div>
            ) : (
              <div className="backlog-chips">
                {backlog.map((o) => (
                  <div key={o.id} className="chip" onMouseDown={(e) => startDrag({ kind: "new", opId: o.id, label: `${orderNo(o.order_id)} · ${o.name}`, startX: e.clientX, startY: e.clientY }, e)}>
                    <strong>{orderNo(o.order_id)}</strong> · {o.name}
                    <span className="dur">{fmtDur(o.duration_minutes)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tidslinje */}
          <div className="gantt2">
            <div className="g-canvas" ref={canvasRef} style={{ width: LABEL_W + widthPx, height: canvasH }}>
              {dayList.filter((d) => d.weekend).map((d) => (
                <div key={"we" + d.i} className="g-weekend" style={{ left: LABEL_W + d.i * dayWidth, width: dayWidth, height: canvasH }} />
              ))}
              {dayList.map((d) => (
                <div key={"dg" + d.i} className="g-daygrid" style={{ left: LABEL_W + d.i * dayWidth, height: canvasH }} />
              ))}
              {dayList.flatMap((d) =>
                Array.from({ length: Math.floor(24 / hourStep) }, (_, k) => (k + 1) * hourStep).filter((h) => h < 24).map((h) => (
                  <div key={`hg${d.i}-${h}`} className="g-hourgrid" style={{ left: LABEL_W + d.i * dayWidth + h * pxph, height: canvasH }} />
                ))
              )}

              <div className="g-head">
                <div className="g-rowlabel" style={{ position: "absolute", zIndex: 6, height: HEAD_H }} />
                {dayList.map((d) => (
                  <div key={"dh" + d.i} className={"g-dayhead" + (d.weekend ? " weekend" : "")} style={{ left: LABEL_W + d.i * dayWidth, width: dayWidth }}>
                    {d.date.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                ))}
                {dayList.flatMap((d) =>
                  Array.from({ length: Math.floor(24 / hourStep) + 1 }, (_, k) => k * hourStep).filter((h) => h < 24).map((h) => (
                    <div key={`ht${d.i}-${h}`} className="g-hourtick" style={{ left: LABEL_W + d.i * dayWidth + h * pxph }}>{String(h).padStart(2, "0")}</div>
                  ))
                )}
              </div>

              <svg className="g-arrows" width={LABEL_W + widthPx} height={canvasH}>
                <defs>
                  <marker id="arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="rgba(206,14,45,0.65)" />
                  </marker>
                </defs>
                {arrows.map((a) => <path key={a.key} d={a.d} markerEnd="url(#arrow)" />)}
              </svg>

              {rows.map((row, ri) => {
                const mc = row.id != null ? machineById[row.id] : null;
                const shiftS = parseTime(mc?.shift_start);
                const shiftE = parseTime(mc?.shift_end);
                return (
                  <div key={String(row.id)} className="g-row" style={{ top: HEAD_H + ri * ROW_H }}>
                    <div className="g-rowlabel">{row.name}</div>
                    {mc && dayList.filter((d) => !d.weekend).map((d) => {
                      const startH = d.i * 24 + shiftS.h + shiftS.m / 60;
                      const endH = d.i * 24 + shiftE.h + shiftE.m / 60;
                      return <div key={"av" + d.i} className="g-avail" style={{ left: LABEL_W + startH * pxph, width: Math.max((endH - startH) * pxph, 0) }} />;
                    })}
                    {showNow && <div className="g-now" style={{ left: LABEL_W + xOf(now), height: ROW_H }} />}
                    {(opsByMachine[String(row.id)] ?? []).map((o) => {
                      const s = new Date(o.start_time!).getTime();
                      const e = new Date(o.end_time!).getTime();
                      const w = Math.max(((e - s) / HOUR) * pxph, 8);
                      const isDrag = drag?.kind === "move" && drag.opId === o.id;
                      return (
                        <div key={o.id} className={"g-bar " + barClass(o) + (isDrag ? " dragging" : "")}
                          style={{ left: LABEL_W + xOf(s), width: w, transform: isDrag ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined }}
                          title={`${orderNo(o.order_id)} · ${o.name}\n${new Date(s).toLocaleString("sv-SE")} – ${new Date(e).toLocaleTimeString("sv-SE")}\nDra för att flytta · dubbelklick = tillbaka till backlog`}
                          onMouseDown={(ev) => startDrag({ kind: "move", opId: o.id, label: o.name, origMs: s, origMachine: o.machine_id, startX: ev.clientX, startY: ev.clientY }, ev)}
                          onDoubleClick={() => unschedule.mutate(o.id)}>
                          {orderNo(o.order_id)} · {o.name}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="legend">
            <span><span className="swatch" style={{ background: "var(--green-avail)" }} />Arbetstid</span>
            <span><span className="swatch" style={{ background: "var(--slate)" }} />Planerad</span>
            <span><span className="swatch" style={{ background: "#2563eb" }} />Pågår</span>
            <span><span className="swatch" style={{ background: "#ce0e2d" }} />Försenad</span>
            <span style={{ marginLeft: "auto" }}>💡 Dubbelklicka på en stapel för att lägga tillbaka momentet i backloggen.</span>
          </div>
        </>
      )}

      {/* dragghost för backlog-moment */}
      {drag?.kind === "new" && (
        <div className="chip-ghost" style={{ left: drag.cx + 10, top: drag.cy + 10 }}>{drag.label}</div>
      )}
      {busy && <div className="replan-toast">⟳ Uppdaterar schema…</div>}
    </>
  );
}
