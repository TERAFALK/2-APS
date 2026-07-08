import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

type Op = {
  id: number; order_id: number; name: string; sequence: number;
  machine_id: number | null; start_time: string | null; end_time: string | null; status: string;
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

export default function Gantt() {
  const qc = useQueryClient();
  const { data: ops = [] } = useQuery<Op[]>({ queryKey: ["operations"], queryFn: api.operations });
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });

  const [pxph, setPxph] = useState(16); // pixlar per timme (zoom)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["operations"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };
  const run = useMutation({ mutationFn: api.runPlan, onSuccess: invalidate });
  const lock = useMutation({ mutationFn: (id: number) => api.lockOperation(id), onSuccess: invalidate });
  const move = useMutation({
    mutationFn: (v: { id: number; start: string; machine: number | null }) => api.moveOperation(v.id, v.start, v.machine),
    onSuccess: invalidate,
  });

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

  const scheduled = ops.filter((o) => o.start_time && o.end_time);

  // horisont: snappa till hela dygn
  const { min, days } = useMemo(() => {
    const t = scheduled.flatMap((o) => [new Date(o.start_time!).getTime(), new Date(o.end_time!).getTime()]);
    if (t.length === 0) return { min: 0, days: 0 };
    const lo = new Date(Math.min(...t)); lo.setHours(0, 0, 0, 0);
    const hi = new Date(Math.max(...t)); hi.setHours(0, 0, 0, 0);
    const dayCount = Math.round((hi.getTime() - lo.getTime()) / DAY) + 1;
    return { min: lo.getTime(), days: dayCount };
  }, [scheduled]);

  const dayWidth = 24 * pxph;
  const widthPx = days * dayWidth;
  const xOf = (ms: number) => ((ms - min) / HOUR) * pxph;

  const rows: { id: number | null; name: string }[] = machines.map((m) => ({ id: m.id, name: m.name }));
  if (scheduled.some((o) => o.machine_id == null)) rows.push({ id: null, name: "Otilldelad" });
  const rowIndexOf = (mid: number | null) => rows.findIndex((r) => r.id === mid);

  const opsByMachine: Record<string, Op[]> = {};
  for (const o of scheduled) (opsByMachine[String(o.machine_id)] ??= []).push(o);

  // dagsinfo
  const dayList = useMemo(() =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date(min + i * DAY);
      return { i, ms: d.getTime(), weekend: d.getDay() === 0 || d.getDay() === 6, date: d };
    }), [min, days]);

  // timtaktsteg beroende på zoom
  const hourStep = pxph >= 26 ? 2 : pxph >= 13 ? 4 : pxph >= 7 ? 6 : 12;

  // beroendepilar
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
  const showNow = days > 0 && now >= min && now <= min + days * DAY;

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
    dragRef.current = { opId: o.id, startX: e.clientX, startY: e.clientY, origMs: new Date(o.start_time!).getTime(), origMachine: o.machine_id };
    setDrag({ opId: o.id, dx: 0, dy: 0 });
  }
  useEffect(() => {
    if (!drag) return;
    document.body.classList.add("dragging-active");
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current!; setDrag({ opId: d.opId, dx: e.clientX - d.startX, dy: e.clientY - d.startY });
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current; dragRef.current = null; setDrag(null);
      document.body.classList.remove("dragging-active");
      if (!d) return;
      const dx = e.clientX - d.startX;
      const deltaMin = Math.round((dx / pxph) * 60 / SNAP_MIN) * SNAP_MIN;
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
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.opId]);

  const canvasH = HEAD_H + rows.length * ROW_H;

  return (
    <>
      <div className="page-head">
        <h1>Produktionsplanering</h1>
        <div className="gantt-toolbar">
          <button className="iconbtn" title="Zooma ut" onClick={() => setPxph((p) => Math.max(4, Math.round(p / 1.4)))}>−</button>
          <button className="iconbtn" title="Zooma in" onClick={() => setPxph((p) => Math.min(80, Math.round(p * 1.4)))}>+</button>
          <button className="btn" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "Planerar…" : "▶ Kör planering"}
          </button>
        </div>
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
              {/* helg-skuggning */}
              {dayList.filter((d) => d.weekend).map((d) => (
                <div key={"we" + d.i} className="g-weekend" style={{ left: LABEL_W + d.i * dayWidth, width: dayWidth, height: canvasH }} />
              ))}

              {/* dygns- & timrutnät */}
              {dayList.map((d) => (
                <div key={"dg" + d.i} className="g-daygrid" style={{ left: LABEL_W + d.i * dayWidth, height: canvasH }} />
              ))}
              {dayList.flatMap((d) =>
                Array.from({ length: Math.floor(24 / hourStep) }, (_, k) => (k + 1) * hourStep).filter((h) => h < 24).map((h) => (
                  <div key={`hg${d.i}-${h}`} className="g-hourgrid" style={{ left: LABEL_W + d.i * dayWidth + h * pxph, height: canvasH }} />
                ))
              )}

              {/* header */}
              <div className="g-head">
                <div className="g-rowlabel" style={{ position: "absolute", zIndex: 6, height: HEAD_H }} />
                {dayList.map((d) => (
                  <div key={"dh" + d.i} className={"g-dayhead" + (d.weekend ? " weekend" : "")} style={{ left: LABEL_W + d.i * dayWidth, width: dayWidth }}>
                    {d.date.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                ))}
                {dayList.flatMap((d) =>
                  Array.from({ length: Math.floor(24 / hourStep) + 1 }, (_, k) => k * hourStep).filter((h) => h < 24).map((h) => (
                    <div key={`ht${d.i}-${h}`} className="g-hourtick" style={{ left: LABEL_W + d.i * dayWidth + h * pxph }}>
                      {String(h).padStart(2, "0")}
                    </div>
                  ))
                )}
              </div>

              {/* pilar */}
              <svg className="g-arrows" width={LABEL_W + widthPx} height={canvasH}>
                <defs>
                  <marker id="arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="rgba(206,14,45,0.65)" />
                  </marker>
                </defs>
                {arrows.map((a) => <path key={a.key} d={a.d} markerEnd="url(#arrow)" />)}
              </svg>

              {/* rader */}
              {rows.map((row, ri) => {
                const mc = row.id != null ? machineById[row.id] : null;
                const shiftS = parseTime(mc?.shift_start);
                const shiftE = parseTime(mc?.shift_end);
                return (
                  <div key={String(row.id)} className="g-row" style={{ top: HEAD_H + ri * ROW_H }}>
                    <div className="g-rowlabel">{row.name}</div>
                    {/* gröna arbetstidsblock (mån–fre) */}
                    {mc && dayList.filter((d) => !d.weekend).map((d) => {
                      const startH = d.i * 24 + shiftS.h + shiftS.m / 60;
                      const endH = d.i * 24 + shiftE.h + shiftE.m / 60;
                      return (
                        <div key={"av" + d.i} className="g-avail"
                          style={{ left: LABEL_W + startH * pxph, width: Math.max((endH - startH) * pxph, 0) }} />
                      );
                    })}
                    {showNow && <div className="g-now" style={{ left: LABEL_W + xOf(now) }} />}
                    {/* operationsstaplar */}
                    {(opsByMachine[String(row.id)] ?? []).map((o) => {
                      const s = new Date(o.start_time!).getTime();
                      const e = new Date(o.end_time!).getTime();
                      const w = Math.max(((e - s) / HOUR) * pxph, 8);
                      const isDrag = drag?.opId === o.id;
                      return (
                        <div key={o.id} className={"g-bar " + barClass(o) + (isDrag ? " dragging" : "")}
                          style={{ left: LABEL_W + xOf(s), width: w, transform: isDrag ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined }}
                          title={`${orderNo(o.order_id)} · ${o.name}\n${new Date(s).toLocaleString("sv-SE")} – ${new Date(e).toLocaleTimeString("sv-SE")}\nDra för att flytta · dubbelklick = lås`}
                          onMouseDown={(ev) => onBarMouseDown(ev, o)}
                          onDoubleClick={() => lock.mutate(o.id)}>
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
            <span><span className="swatch" style={{ background: "#111418" }} />Låst</span>
            <span style={{ marginLeft: "auto" }}>💡 Dra en operation i sidled (flytta i tid) eller till annan rad (byt maskin) — schemat planeras om automatiskt.</span>
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
