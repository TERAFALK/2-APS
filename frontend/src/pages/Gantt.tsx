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
const HEAD_H = 56;
const ROW_H = 48;
const BAR_TOP = 11;
const BAR_CENTER = 24;
const SNAP_MIN = 15;
const SNAP_MS = SNAP_MIN * 60000;
const DAYS = 28;

const pad = (n: number) => String(n).padStart(2, "0");
const parseTime = (s?: string) => {
  if (!s) return { h: 7, m: 0 };
  const [h, m] = s.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
};
const fmtDur = (min: number) => (min >= 60 ? `${(min / 60).toFixed(1)}h` : `${min}m`);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const msToLocalIso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
};
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

export default function Gantt() {
  const qc = useQueryClient();
  const { data: ops = [] } = useQuery<Op[]>({ queryKey: ["operations"], queryFn: api.operations });
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });

  const [pxph, setPxph] = useState(22);
  const [warn, setWarn] = useState("");
  const warnTimer = useRef<number | null>(null);
  const flashWarn = (m: string) => { setWarn(m); if (warnTimer.current) clearTimeout(warnTimer.current); warnTimer.current = window.setTimeout(() => setWarn(""), 2600); };

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["operations"] }); qc.invalidateQueries({ queryKey: ["orders"] }); };
  const schedule = useMutation({
    mutationFn: (v: { id: number; start: string; machine: number | null }) => api.scheduleManual(v.id, v.start, v.machine),
    onSuccess: invalidate, onError: (e: any) => flashWarn(e.message || "Kunde inte placera"),
  });
  const unschedule = useMutation({ mutationFn: (id: number) => api.unscheduleMoment(id), onSuccess: invalidate });
  const split = useMutation({ mutationFn: (v: { id: number; parts: number }) => api.splitPhase(v.id, v.parts), onSuccess: invalidate, onError: (e: any) => flashWarn(e.message) });

  const dueByOrder = useMemo(() => { const m: Record<number, number> = {}; for (const o of orders) m[o.id] = new Date(o.due_date).getTime(); return m; }, [orders]);
  const orderNo = (id: number) => orders.find((o) => o.id === id)?.order_no ?? id;
  // fasernas ordning inom sin order (1,2,3…)
  const posById = useMemo(() => {
    const byOrder: Record<number, Op[]> = {};
    for (const o of ops) (byOrder[o.order_id] ??= []).push(o);
    const map: Record<number, number> = {};
    for (const list of Object.values(byOrder)) { list.sort((a, b) => a.sequence - b.sequence); list.forEach((o, i) => (map[o.id] = i + 1)); }
    return map;
  }, [ops]);

  const scheduled = ops.filter((o) => o.start_time && o.end_time);
  const backlog = ops.filter((o) => !o.start_time).sort((a, b) => a.order_id - b.order_id || a.sequence - b.sequence);

  const min = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow - 7);
    return d.getTime();
  }, []);
  const days = DAYS;
  const dayWidth = 24 * pxph;
  const widthPx = days * dayWidth;
  const xOf = (ms: number) => ((ms - min) / HOUR) * pxph;

  const rows = useMemo(() =>
    [...machines].sort((a, b) => String(a.name).localeCompare(String(b.name), "sv")).map((m) => ({ id: m.id as number, name: m.name as string })),
    [machines]);
  const rowIndexOf = (mid: number | null) => rows.findIndex((r) => r.id === mid);

  const opsByMachine: Record<string, Op[]> = {};
  for (const o of scheduled) (opsByMachine[String(o.machine_id)] ??= []).push(o);

  const dayList = useMemo(() =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date(min + i * DAY);
      return { i, weekend: d.getDay() === 0 || d.getDay() === 6, date: d, week: isoWeek(d), monday: (d.getDay() + 6) % 7 === 0 };
    }), [min, days]);

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
        const x1 = LABEL_W + xOf(new Date(a.end_time!).getTime()), y1 = HEAD_H + ri * ROW_H + BAR_CENTER;
        const x2 = LABEL_W + xOf(new Date(b.start_time!).getTime()), y2 = HEAD_H + rj * ROW_H + BAR_CENTER;
        const dx = Math.max(20, Math.abs(x2 - x1) / 2);
        paths.push({ key: `${a.id}-${b.id}`, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` });
      }
    }
    return paths;
  }, [scheduled, rows, min, pxph]);

  const now = Date.now();
  const showNow = now >= min && now <= min + days * DAY;
  const nowLabel = new Date(now).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

  const barClass = (o: Op) => {
    if (o.status === "running") return "running";
    const due = dueByOrder[o.order_id];
    if (due && o.end_time && new Date(o.end_time).getTime() > due) return "late";
    return "ok";
  };

  // ---------- scroll & zoom ----------
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<number | null>(null);
  const scrolled = useRef(false);

  function zoom(factor: number) {
    const sc = scrollRef.current;
    if (sc) anchorRef.current = min + ((sc.scrollLeft + sc.clientWidth / 2 - LABEL_W) / pxph) * HOUR;
    setPxph((p) => clamp(Math.round(p * factor), 6, 80));
  }
  useEffect(() => {
    const sc = scrollRef.current; if (!sc) return;
    if (anchorRef.current != null) { sc.scrollLeft = LABEL_W + ((anchorRef.current - min) / HOUR) * pxph - sc.clientWidth / 2; anchorRef.current = null; }
    else if (!scrolled.current && showNow) { sc.scrollLeft = Math.max(0, xOf(now) - 140); scrolled.current = true; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxph, rows.length]);

  // ---------- drag ----------
  function beginDrag(e: React.MouseEvent, opt: { kind: "move"; opId: number; origMs: number; origMachine: number | null; durMin: number } | { kind: "new"; opId: number; durMin: number }) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const el = opt.kind === "move" ? (e.currentTarget as HTMLElement) : null;
    const preview = previewRef.current;
    const durWidth = Math.max((opt.durMin / 60) * pxph, 10);
    const grabOffsetX = el ? startX - el.getBoundingClientRect().left : 0;
    const origRow = opt.kind === "move" ? rowIndexOf(opt.origMachine) : 0;
    let snap: { ms: number; machine: number | null; row: number } | null = null;

    if (el) el.classList.add("dragging");
    document.body.classList.add("dragging-active");

    const compute = (cx: number, cy: number) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const row = clamp(Math.floor((cy - rect.top - HEAD_H) / ROW_H), 0, rows.length - 1);
      const rawMs = min + ((cx - grabOffsetX - rect.left - LABEL_W) / pxph) * HOUR;
      const ms = clamp(Math.round(rawMs / SNAP_MS) * SNAP_MS, min, min + days * DAY - opt.durMin * 60000);
      return { ms, machine: rows[row].id, row };
    };
    const onMove = (ev: MouseEvent) => {
      snap = compute(ev.clientX, ev.clientY);
      const left = LABEL_W + xOf(snap.ms);
      if (preview) { preview.style.display = "block"; preview.style.left = left + "px"; preview.style.top = HEAD_H + snap.row * ROW_H + BAR_TOP + "px"; preview.style.width = durWidth + "px"; }
      if (el) { const origLeft = LABEL_W + xOf(opt.kind === "move" ? opt.origMs : min); el.style.transform = `translate(${left - origLeft}px, ${(snap.row - origRow) * ROW_H}px)`; }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("dragging-active");
      if (el) { el.classList.remove("dragging"); el.style.transform = ""; }
      if (preview) preview.style.display = "none";
      if (!snap || snap.machine == null) return;
      if (opt.kind === "move" && snap.machine === opt.origMachine && Math.abs(snap.ms - opt.origMs) < SNAP_MS) return;
      schedule.mutate({ id: opt.opId, start: msToLocalIso(snap.ms), machine: snap.machine });
    };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }

  const askSplit = (o: Op) => {
    const n = Number(window.prompt(`Dela "${o.name}" (${fmtDur(o.duration_minutes)}) i hur många lika delar?`, "5"));
    if (n && n >= 2) split.mutate({ id: o.id, parts: Math.floor(n) });
  };

  const canvasH = HEAD_H + rows.length * ROW_H;
  const busy = schedule.isPending || unschedule.isPending || split.isPending;

  return (
    <>
      <div className="page-head">
        <h1>Produktionsplanering</h1>
        <div className="gantt-toolbar">
          <button className="iconbtn" title="Zooma ut" onClick={() => zoom(1 / 1.4)}>−</button>
          <button className="iconbtn" title="Zooma in" onClick={() => zoom(1.4)}>+</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty"><div className="icon">🏭</div><h3>Inga maskiner</h3><div>Lägg upp maskiner under <strong>Grunddata</strong> först.</div></div>
      ) : (
        <>
          <div className="backlog">
            <div className="backlog-head">
              <h2 style={{ margin: 0 }}>Faser att planera ({backlog.length})</h2>
              <span className="drop-hint">Dra en fas till en maskinrad. Långa faser kan delas med ✂.</span>
            </div>
            {backlog.length === 0 ? (
              <div className="subtle">Inga oplanerade faser. Lägg till faser på en order under <strong>Order</strong>.</div>
            ) : (
              <div className="backlog-chips">
                {backlog.map((o) => (
                  <div key={o.id} className="chip" onMouseDown={(e) => beginDrag(e, { kind: "new", opId: o.id, durMin: o.duration_minutes })}>
                    <span className="seq">{posById[o.id]}</span>
                    <strong>{orderNo(o.order_id)}</strong> · {o.name}
                    <span className="dur">{fmtDur(o.duration_minutes)}</span>
                    <span className="split-btn" title="Dela fasen" onMouseDown={(e) => e.stopPropagation()} onClick={() => askSplit(o)}>✂</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="gantt2" ref={scrollRef}>
            <div className="g-canvas" ref={canvasRef} style={{ width: LABEL_W + widthPx, height: canvasH }}>
              {dayList.filter((d) => d.weekend).map((d) => (
                <div key={"we" + d.i} className="g-weekend" style={{ left: LABEL_W + d.i * dayWidth, width: dayWidth, height: canvasH }} />
              ))}
              {dayList.map((d) => (
                <div key={"dg" + d.i} className="g-daygrid" style={{ left: LABEL_W + d.i * dayWidth, height: canvasH }} />
              ))}
              {dayList.flatMap((d) =>
                Array.from({ length: 23 }, (_, k) => k + 1).map((h) => (
                  <div key={`hg${d.i}-${h}`} className="g-hourgrid" style={{ left: LABEL_W + d.i * dayWidth + h * pxph, height: canvasH }} />
                ))
              )}

              <div className="g-head">
                <div className="g-rowlabel" style={{ position: "absolute", zIndex: 6, height: HEAD_H }} />
                {dayList.map((d) => (
                  <div key={"dh" + d.i} className={"g-dayhead" + (d.weekend ? " weekend" : "")} style={{ left: LABEL_W + d.i * dayWidth, width: dayWidth }}>
                    <span className="dh-date">{d.date.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span className="dh-week">v.{d.week}</span>
                  </div>
                ))}
                {dayList.flatMap((d) =>
                  Array.from({ length: 24 }, (_, h) => h).map((h) => (
                    <div key={`ht${d.i}-${h}`} className="g-hourtick" style={{ left: LABEL_W + d.i * dayWidth + h * pxph }}>{pad(h)}</div>
                  ))
                )}
                {showNow && <div className="g-nowlabel" style={{ left: LABEL_W + xOf(now) }}>nu {nowLabel}</div>}
              </div>

              <svg className="g-arrows" width={LABEL_W + widthPx} height={canvasH}>
                <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="rgba(206,14,45,0.6)" /></marker></defs>
                {arrows.map((a) => <path key={a.key} d={a.d} markerEnd="url(#arrow)" />)}
              </svg>

              <div className="g-preview" ref={previewRef} style={{ display: "none" }} />

              {rows.map((row, ri) => {
                const mc = machines.find((m) => m.id === row.id);
                const shiftS = parseTime(mc?.shift_start), shiftE = parseTime(mc?.shift_end);
                return (
                  <div key={row.id} className="g-row" style={{ top: HEAD_H + ri * ROW_H }}>
                    <div className="g-rowlabel"><div className="g-rowname">{row.name}</div></div>
                    {mc && dayList.filter((d) => !d.weekend).map((d) => {
                      const sH = d.i * 24 + shiftS.h + shiftS.m / 60, eH = d.i * 24 + shiftE.h + shiftE.m / 60;
                      return <div key={"av" + d.i} className="g-avail" style={{ left: LABEL_W + sH * pxph, width: Math.max((eH - sH) * pxph, 0) }} />;
                    })}
                    {showNow && <div className="g-now" style={{ left: LABEL_W + xOf(now), height: ROW_H }} />}
                    {(opsByMachine[String(row.id)] ?? []).map((o) => {
                      const s = new Date(o.start_time!).getTime(), e = new Date(o.end_time!).getTime();
                      const w = Math.max(((e - s) / HOUR) * pxph, 12);
                      return (
                        <div key={o.id} className={"g-bar " + barClass(o)} style={{ left: LABEL_W + xOf(s), width: w }}
                          title={`${orderNo(o.order_id)} · fas ${posById[o.id]}: ${o.name}\n${new Date(s).toLocaleString("sv-SE")} – ${new Date(e).toLocaleTimeString("sv-SE")}\nDra = flytta · dubbelklick = tillbaka till backlog`}
                          onMouseDown={(ev) => beginDrag(ev, { kind: "move", opId: o.id, origMs: s, origMachine: o.machine_id, durMin: o.duration_minutes })}
                          onDoubleClick={() => unschedule.mutate(o.id)}>
                          <span className="seq light">{posById[o.id]}</span>{orderNo(o.order_id)} · {o.name}
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
            <span style={{ marginLeft: "auto" }}>💡 Dubbelklicka på en fas för att lägga tillbaka den i backloggen · ✂ delar en lång fas.</span>
          </div>
        </>
      )}

      {warn && <div className="replan-toast warn">⚠ {warn}</div>}
      {busy && !warn && <div className="replan-toast">⟳ Uppdaterar schema…</div>}
    </>
  );
}
