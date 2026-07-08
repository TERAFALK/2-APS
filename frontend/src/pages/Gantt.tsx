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
const BAR_TOP = 11;
const BAR_CENTER = 24;
const SNAP_MIN = 15;
const SNAP_MS = SNAP_MIN * 60000;
const DAYS = 42; // fast fönster: ingen omflödning när moment placeras

const parseTime = (s?: string) => {
  if (!s) return { h: 7, m: 0 };
  const [h, m] = s.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
};
const fmtDur = (min: number) => (min >= 60 ? `${(min / 60).toFixed(1)}h` : `${min}m`);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function Gantt() {
  const qc = useQueryClient();
  const { data: ops = [] } = useQuery<Op[]>({ queryKey: ["operations"], queryFn: api.operations });
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });

  const [pxph, setPxph] = useState(14);

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

  // FAST tidsfönster: måndag förra veckan + 6 veckor. Ändras aldrig av placeringar.
  const min = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7; // 0 = måndag
    d.setDate(d.getDate() - dow - 7);
    return d.getTime();
  }, []);
  const days = DAYS;

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

  const hourStep = pxph >= 30 ? 2 : pxph >= 15 ? 3 : pxph >= 9 ? 6 : 12;

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
  const nowLabel = new Date(now).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

  const barClass = (o: Op) => {
    if (o.status === "running") return "running";
    const due = dueByOrder[o.order_id];
    if (due && o.end_time && new Date(o.end_time).getTime() > due) return "late";
    return "ok";
  };

  // ---------- imperativ drag med live snap-preview ----------
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // scrolla till "nu" en gång
  const scrolled = useRef(false);
  useEffect(() => {
    if (!scrolled.current && scrollRef.current && showNow) {
      scrollRef.current.scrollLeft = Math.max(0, xOf(now) - 120);
      scrolled.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, pxph]);

  function beginDrag(
    e: React.MouseEvent,
    opt:
      | { kind: "move"; opId: number; origMs: number; origMachine: number | null; durMin: number }
      | { kind: "new"; opId: number; label: string; durMin: number }
  ) {
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
      const leftClient = cx - grabOffsetX;
      const rawMs = min + ((leftClient - rect.left - LABEL_W) / pxph) * HOUR;
      const ms = clamp(Math.round(rawMs / SNAP_MS) * SNAP_MS, min, min + days * DAY - opt.durMin * 60000);
      return { ms, machine: rows[row].id, row };
    };

    const onMove = (ev: MouseEvent) => {
      snap = compute(ev.clientX, ev.clientY);
      const left = LABEL_W + xOf(snap.ms);
      if (preview) {
        preview.style.display = "block";
        preview.style.left = left + "px";
        preview.style.top = HEAD_H + snap.row * ROW_H + BAR_TOP + "px";
        preview.style.width = durWidth + "px";
      }
      if (el) {
        const origLeft = LABEL_W + xOf(opt.kind === "move" ? opt.origMs : min);
        el.style.transform = `translate(${left - origLeft}px, ${(snap.row - origRow) * ROW_H}px)`;
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("dragging-active");
      if (el) { el.classList.remove("dragging"); el.style.transform = ""; }
      if (preview) preview.style.display = "none";
      if (!snap) return; // ingen rörelse
      if (opt.kind === "move" && snap.machine === opt.origMachine && Math.abs(snap.ms - opt.origMs) < SNAP_MS) return;
      if (snap.machine == null) return;
      schedule.mutate({ id: opt.opId, start: new Date(snap.ms).toISOString(), machine: snap.machine });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

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
          <div className="backlog">
            <div className="backlog-head">
              <h2 style={{ margin: 0 }}>Moment att planera ({backlog.length})</h2>
              <span className="drop-hint">Dra ett moment till en maskinrad — den streckade rutan visar var det landar.</span>
            </div>
            {backlog.length === 0 ? (
              <div className="subtle">
                Inga oplanerade moment. Skapa en order (då genereras dess moment) eller tryck <strong>Förbered moment</strong>.
              </div>
            ) : (
              <div className="backlog-chips">
                {backlog.map((o) => (
                  <div key={o.id} className="chip" onMouseDown={(e) => beginDrag(e, { kind: "new", opId: o.id, label: `${orderNo(o.order_id)} · ${o.name}`, durMin: o.duration_minutes })}>
                    <strong>{orderNo(o.order_id)}</strong> · {o.name}
                    <span className="dur">{fmtDur(o.duration_minutes)}</span>
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
                    <div key={`ht${d.i}-${h}`} className="g-hourtick" style={{ left: LABEL_W + d.i * dayWidth + h * pxph }}>{String(h).padStart(2, "0")}:00</div>
                  ))
                )}
                {showNow && <div className="g-nowlabel" style={{ left: LABEL_W + xOf(now) }}>nu {nowLabel}</div>}
              </div>

              <svg className="g-arrows" width={LABEL_W + widthPx} height={canvasH}>
                <defs>
                  <marker id="arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="rgba(206,14,45,0.6)" />
                  </marker>
                </defs>
                {arrows.map((a) => <path key={a.key} d={a.d} markerEnd="url(#arrow)" />)}
              </svg>

              {/* snap-preview */}
              <div className="g-preview" ref={previewRef} style={{ display: "none" }} />

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
                      const w = Math.max(((e - s) / HOUR) * pxph, 10);
                      return (
                        <div key={o.id} className={"g-bar " + barClass(o)}
                          style={{ left: LABEL_W + xOf(s), width: w }}
                          title={`${orderNo(o.order_id)} · ${o.name}\n${new Date(s).toLocaleString("sv-SE")} – ${new Date(e).toLocaleTimeString("sv-SE")}\nDra för att flytta · dubbelklick = tillbaka till backlog`}
                          onMouseDown={(ev) => beginDrag(ev, { kind: "move", opId: o.id, origMs: s, origMachine: o.machine_id, durMin: o.duration_minutes })}
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
            <span style={{ marginLeft: "auto" }}>💡 Dubbelklicka på en stapel för att lägga tillbaka den i backloggen.</span>
          </div>
        </>
      )}

      {busy && <div className="replan-toast">⟳ Uppdaterar schema…</div>}
    </>
  );
}
