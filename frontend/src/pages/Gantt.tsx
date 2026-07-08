import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

type Op = {
  id: number; order_id: number; name: string; sequence: number;
  machine_id: number | null; start_time: string | null; end_time: string | null;
  status: string; duration_minutes: number; overtime: boolean;
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
const parseTime = (s?: string) => { if (!s) return { h: 7, m: 0 }; const [h, m] = s.split(":").map(Number); return { h: h || 0, m: m || 0 }; };
const fmtDur = (min: number) => (min >= 60 ? `${(min / 60).toFixed(1).replace(".", ",").replace(",0", "")} h` : `${min} min`);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const msToLocalIso = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}
type Shift = { sh: number; sm: number; eh: number; em: number };
function buildSegments(startMs: number, durMin: number, sh: Shift): { start: number; end: number }[] {
  const dayMin = (sh.eh * 60 + sh.em) - (sh.sh * 60 + sh.sm);
  if (dayMin <= 0) return [{ start: startMs, end: startMs + durMin * 60000 }];
  const nextDay = (c: Date) => { const d = new Date(c); d.setDate(d.getDate() + 1); d.setHours(sh.sh, sh.sm, 0, 0); return d; };
  let rem = durMin, guard = 0; const segs: { start: number; end: number }[] = []; let cur = new Date(startMs);
  while (rem > 0 && guard++ < 200) {
    const dow = cur.getDay();
    const sStart = new Date(cur); sStart.setHours(sh.sh, sh.sm, 0, 0);
    const sEnd = new Date(cur); sEnd.setHours(sh.eh, sh.em, 0, 0);
    if (dow === 0 || dow === 6) { cur = nextDay(cur); continue; }
    if (cur < sStart) cur = new Date(sStart);
    if (cur >= sEnd) { cur = nextDay(cur); continue; }
    const avail = (sEnd.getTime() - cur.getTime()) / 60000;
    const use = Math.min(avail, rem);
    segs.push({ start: cur.getTime(), end: cur.getTime() + use * 60000 });
    rem -= use; cur = nextDay(cur);
  }
  return segs.length ? segs : [{ start: startMs, end: startMs + durMin * 60000 }];
}

export default function Gantt() {
  const qc = useQueryClient();
  const { data: ops = [] } = useQuery<Op[]>({ queryKey: ["operations"], queryFn: api.operations });
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });

  const [pxph, setPxph] = useState(26);
  const [view, setView] = useState<"compact" | "day">("compact");
  const [hideWeekends, setHideWeekends] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [warn, setWarn] = useState("");
  const [popState, setPop] = useState<{ opId: number; x: number; y: number } | null>(null);
  const warnTimer = useRef<number | null>(null);
  const flashWarn = (m: string) => { setWarn(m); if (warnTimer.current) clearTimeout(warnTimer.current); warnTimer.current = window.setTimeout(() => setWarn(""), 2600); };

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["operations"] }); qc.invalidateQueries({ queryKey: ["orders"] }); };
  const schedule = useMutation({ mutationFn: (v: { id: number; start: string; machine: number | null }) => api.scheduleManual(v.id, v.start, v.machine), onSuccess: invalidate, onError: (e: any) => flashWarn(e.message) });
  const unschedule = useMutation({ mutationFn: (id: number) => api.unscheduleMoment(id), onSuccess: invalidate });
  const setStatus = useMutation({ mutationFn: (v: { id: number; s: string }) => api.setPhaseStatus(v.id, v.s), onSuccess: invalidate });
  const resize = useMutation({ mutationFn: (v: { id: number; hours: number; start?: string }) => api.resizePhase(v.id, v.hours, v.start), onSuccess: invalidate, onError: (e: any) => flashWarn(e.message) });
  const placePart = useMutation({ mutationFn: (v: { id: number; start: string; machine: number | null; hours: number }) => api.placePart(v.id, v.start, v.machine, v.hours), onSuccess: invalidate, onError: (e: any) => flashWarn(e.message) });

  const dueByOrder = useMemo(() => { const m: Record<number, number> = {}; for (const o of orders) m[o.id] = new Date(o.due_date).getTime(); return m; }, [orders]);
  const orderNo = (id: number) => orders.find((o) => o.id === id)?.order_no ?? id;
  // fasnummer per order rankat på sekvens → delar av samma fas (samma sequence) delar nummer
  const posById = useMemo(() => {
    const byOrder: Record<number, Op[]> = {}; for (const o of ops) (byOrder[o.order_id] ??= []).push(o);
    const map: Record<number, number> = {};
    for (const list of Object.values(byOrder)) {
      const seqs = [...new Set(list.map((o) => o.sequence))].sort((a, b) => a - b);
      const rank: Record<number, number> = {}; seqs.forEach((s, i) => (rank[s] = i + 1));
      list.forEach((o) => (map[o.id] = rank[o.sequence]));
    }
    return map;
  }, [ops]);

  const scheduled = ops.filter((o) => o.start_time && o.end_time);
  const backlog = ops.filter((o) => !o.start_time).sort((a, b) => a.order_id - b.order_id || a.sequence - b.sequence);

  const min = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow - 7); return d.getTime(); }, []);
  const days = DAYS;

  // synligt fönster per dygn (arbetstid ±1h eller hela dygnet)
  const bounds = useMemo(() => {
    let s = 24, e = 0;
    for (const m of machines) { const a = parseTime(m.shift_start), b = parseTime(m.shift_end); s = Math.min(s, a.h + a.m / 60); e = Math.max(e, b.h + b.m / 60); }
    if (!(e > s)) { s = 6; e = 18; }
    return { s, e };
  }, [machines]);
  const winStart = view === "day" ? 0 : clamp(Math.floor(bounds.s - 1), 0, 22);
  const winEnd = view === "day" ? 24 : clamp(Math.ceil(bounds.e + 1), winStart + 1, 24);
  const visHours = winEnd - winStart;
  const dayWidth = visHours * pxph;

  // kolumn-layout: dölj ev. helger genom att inte ge dem en kolumn
  const cols = useMemo(() => {
    const arr: number[] = []; const colToDay: number[] = []; let col = 0;
    for (let i = 0; i < days; i++) {
      arr[i] = col;
      const wd = new Date(min + i * DAY).getDay();
      const we = wd === 0 || wd === 6;
      if (!(hideWeekends && we)) { colToDay[col] = i; col++; }
    }
    return { arr, total: col || 1, colToDay };
  }, [min, days, hideWeekends]);
  const widthPx = cols.total * dayWidth;

  const xOf = (ms: number) => {
    const di = clamp(Math.floor((ms - min) / DAY), 0, days - 1);
    const base = cols.arr[di] * dayWidth;
    const h = clamp((ms - (min + di * DAY)) / HOUR, winStart, winEnd);
    return base + (h - winStart) * pxph;
  };
  const msFromX = (x: number) => {
    const col = clamp(Math.floor(x / dayWidth), 0, cols.total - 1);
    const di = cols.colToDay[col] ?? 0;
    const h = clamp(winStart + (x - col * dayWidth) / pxph, winStart, winEnd);
    return min + di * DAY + h * HOUR;
  };

  const rows = useMemo(() => [...machines].sort((a, b) => String(a.name).localeCompare(String(b.name), "sv")).map((m) => ({ id: m.id as number, name: m.name as string })), [machines]);
  const rowIndexOf = (mid: number | null) => rows.findIndex((r) => r.id === mid);
  const shiftOf = (mid: number | null): Shift => { const m = machines.find((x) => x.id === mid); const s = parseTime(m?.shift_start), e = parseTime(m?.shift_end); return { sh: s.h, sm: s.m, eh: e.h, em: e.m }; };

  const opsByMachine: Record<string, Op[]> = {};
  for (const o of scheduled) (opsByMachine[String(o.machine_id)] ??= []).push(o);

  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => { const d = new Date(min + i * DAY); const monday = (d.getDay() + 6) % 7 === 0; return { i, weekend: d.getDay() === 0 || d.getDay() === 6, date: d, week: isoWeek(d), monday, dx: cols.arr[i] * dayWidth }; }), [min, days, cols, dayWidth]);
  const visibleDays = useMemo(() => dayList.filter((d) => !(hideWeekends && d.weekend)), [dayList, hideWeekends]);
  const hourList = useMemo(() => { const hs: number[] = []; for (let h = Math.ceil(winStart); h < winEnd; h++) hs.push(h); return hs; }, [winStart, winEnd]);

  // en placerad fas = ett sammanhängande block (elapsed tid). Övertid räknas automatiskt.
  const opSegments = (o: Op): { start: number; end: number }[] => {
    const s = new Date(o.start_time!).getTime();
    return [{ start: s, end: s + o.duration_minutes * 60000 }];
  };
  // minuter av blocket som ligger utanför maskinens arbetstid (nätter/helger) = övertid
  const overtimeMinutes = (o: Op): number => {
    if (!o.start_time) return 0;
    const sh = shiftOf(o.machine_id); const start = new Date(o.start_time).getTime(); const end = start + o.duration_minutes * 60000;
    let work = 0, guard = 0; let cur = new Date(start);
    while (cur.getTime() < end && guard++ < 400) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) {
        const s2 = new Date(cur); s2.setHours(sh.sh, sh.sm, 0, 0);
        const e2 = new Date(cur); e2.setHours(sh.eh, sh.em, 0, 0);
        const a = Math.max(cur.getTime(), s2.getTime()), b = Math.min(end, e2.getTime());
        if (b > a) work += (b - a) / 60000;
      }
      const nd = new Date(cur); nd.setDate(nd.getDate() + 1); nd.setHours(0, 0, 0, 0); cur = nd;
    }
    return Math.max(0, o.duration_minutes - work);
  };
  // tidsintervall av blocket som ligger utanför arbetstid (för att randa bara den delen)
  const overtimeIntervals = (o: Op): { start: number; end: number }[] => {
    if (!o.start_time) return [];
    const sh = shiftOf(o.machine_id); const start = new Date(o.start_time).getTime(); const end = start + o.duration_minutes * 60000;
    const work: { a: number; b: number }[] = []; let cur = new Date(start); let guard = 0;
    while (cur.getTime() < end && guard++ < 400) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) {
        const s2 = new Date(cur); s2.setHours(sh.sh, sh.sm, 0, 0);
        const e2 = new Date(cur); e2.setHours(sh.eh, sh.em, 0, 0);
        const a = Math.max(cur.getTime(), s2.getTime()), b = Math.min(end, e2.getTime());
        if (b > a) work.push({ a, b });
      }
      const nd = new Date(cur); nd.setDate(nd.getDate() + 1); nd.setHours(0, 0, 0, 0); cur = nd;
    }
    const ot: { start: number; end: number }[] = []; let prev = start;
    for (const w of work) { if (w.a > prev) ot.push({ start: prev, end: w.a }); prev = Math.max(prev, w.b); }
    if (prev < end) ot.push({ start: prev, end });
    return ot;
  };

  const now = Date.now();
  const showNow = now >= min && now <= min + days * DAY;
  const nowLabel = new Date(now).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

  const barClass = (o: Op) => {
    if (o.status === "done") return "done";
    if (o.status === "delayed") return "delayed";
    if (o.status === "running") return "running";
    const due = dueByOrder[o.order_id];
    if (due && o.end_time && new Date(o.end_time).getTime() > due) return "late";
    return "ok";
  };

  const arrows = useMemo(() => {
    const byOrder: Record<number, Op[]> = {}; for (const o of scheduled) (byOrder[o.order_id] ??= []).push(o);
    const paths: { key: string; d: string }[] = [];
    for (const chain of Object.values(byOrder)) {
      // sortera i TIDSORDNING så pilarna alltid går framåt, oavsett i vilken ordning faserna placerades
      chain.sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime() || a.sequence - b.sequence);
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i], b = chain[i + 1];
        const ri = rowIndexOf(a.machine_id), rj = rowIndexOf(b.machine_id);
        if (ri < 0 || rj < 0) continue;
        const aEnd = new Date(a.start_time!).getTime() + a.duration_minutes * 60000;
        const x1 = LABEL_W + xOf(aEnd), y1 = HEAD_H + ri * ROW_H + BAR_CENTER;
        const x2 = LABEL_W + xOf(new Date(b.start_time!).getTime()), y2 = HEAD_H + rj * ROW_H + BAR_CENTER;
        const dx = Math.max(20, Math.abs(x2 - x1) / 2);
        paths.push({ key: `${a.id}-${b.id}`, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` });
      }
    }
    return paths;
  }, [scheduled, rows, min, pxph, winStart, winEnd]);

  // scroll & zoom (behåll mittpunkt vid zoom/vy-byte)
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<number | null>(null);
  const scrolled = useRef(false);
  const captureAnchor = () => { const sc = scrollRef.current; if (sc) anchorRef.current = msFromX(sc.scrollLeft + sc.clientWidth / 2 - LABEL_W); };
  useEffect(() => {
    const sc = scrollRef.current; if (!sc) return;
    if (anchorRef.current != null) { sc.scrollLeft = LABEL_W + xOf(anchorRef.current) - sc.clientWidth / 2; anchorRef.current = null; }
    else if (!scrolled.current && showNow) { sc.scrollLeft = Math.max(0, xOf(now) - 140); scrolled.current = true; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxph, view, rows.length]);

  function beginDrag(e: React.MouseEvent, opt: { kind: "move"; opId: number; origMs: number; origMachine: number | null; durMin: number; overtime: boolean } | { kind: "new"; opId: number; durMin: number }) {
    e.preventDefault();
    setPop(null);
    const startX = e.clientX, startY = e.clientY;
    const el = opt.kind === "move" ? (e.currentTarget as HTMLElement) : null;
    const preview = previewRef.current;
    const origRow = opt.kind === "move" ? rowIndexOf(opt.origMachine) : 0;
    let snap: { ms: number; machine: number | null; row: number } | null = null;
    let moved = false;
    document.body.classList.add("dragging-active");

    const compute = (cx: number, cy: number) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const row = clamp(Math.floor((cy - rect.top - HEAD_H) / ROW_H), 0, rows.length - 1);
      const raw = msFromX(cx - rect.left - LABEL_W);
      const ms = clamp(Math.round(raw / SNAP_MS) * SNAP_MS, min, min + days * DAY - 60000);
      return { ms, machine: rows[row].id, row };
    };
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) moved = true;
      snap = compute(ev.clientX, ev.clientY);
      const seg0 = { start: snap.ms, end: snap.ms + opt.durMin * 60000 };
      const left = LABEL_W + xOf(seg0.start), w = Math.max(xOf(seg0.end) - xOf(seg0.start), 10);
      if (el) el.classList.add("dragging");
      if (preview) { preview.style.display = "block"; preview.style.left = left + "px"; preview.style.top = HEAD_H + snap.row * ROW_H + BAR_TOP + "px"; preview.style.width = w + "px"; }
      if (el) { const origLeft = LABEL_W + xOf(opt.kind === "move" ? opt.origMs : min); el.style.transform = `translate(${left - origLeft}px, ${(snap.row - origRow) * ROW_H}px)`; }
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("dragging-active");
      if (el) { el.classList.remove("dragging"); el.style.transform = ""; }
      if (preview) preview.style.display = "none";
      if (!moved) {
        if (opt.kind === "move") setPop({ opId: opt.opId, x: ev.clientX, y: ev.clientY });
        else setSelectedId((prev) => (prev === opt.opId ? null : opt.opId)); // klick på chip = markera för att måla in timmar
        return;
      }
      if (!snap || snap.machine == null) return;
      if (opt.kind === "move" && snap.machine === opt.origMachine && Math.abs(snap.ms - opt.origMs) < SNAP_MS) return;
      schedule.mutate({ id: opt.opId, start: msToLocalIso(snap.ms), machine: snap.machine });
    };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }

  // högerhandtag: ändra blockets slut (elapsed tid)
  function beginResize(e: React.MouseEvent, o: Op) {
    e.stopPropagation(); e.preventDefault();
    const startMs = new Date(o.start_time!).getTime(); const ri = rowIndexOf(o.machine_id);
    const preview = previewRef.current; let newDur = o.duration_minutes;
    document.body.classList.add("dragging-active");
    const onMove = (ev: MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const targetMs = Math.max(startMs + SNAP_MS, Math.round(msFromX(ev.clientX - rect.left - LABEL_W) / SNAP_MS) * SNAP_MS);
      newDur = Math.max(SNAP_MIN, Math.round((targetMs - startMs) / 60000 / SNAP_MIN) * SNAP_MIN);
      if (preview) { preview.style.display = "block"; preview.style.left = LABEL_W + xOf(startMs) + "px"; preview.style.width = Math.max(xOf(startMs + newDur * 60000) - xOf(startMs), 10) + "px"; preview.style.top = HEAD_H + ri * ROW_H + BAR_TOP + "px"; }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("dragging-active"); if (preview) preview.style.display = "none";
      if (Math.abs(newDur - o.duration_minutes) >= SNAP_MIN) resize.mutate({ id: o.id, hours: newDur / 60 });
    };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }
  // vänsterhandtag: flytta blockets start (elapsed tid), resten till backlog
  function beginResizeStart(e: React.MouseEvent, o: Op) {
    e.stopPropagation(); e.preventDefault();
    const startMs = new Date(o.start_time!).getTime(); const ri = rowIndexOf(o.machine_id);
    const origEnd = startMs + o.duration_minutes * 60000;
    const preview = previewRef.current; let newStart = startMs, newDur = o.duration_minutes;
    document.body.classList.add("dragging-active");
    const onMove = (ev: MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      newStart = clamp(Math.round(msFromX(ev.clientX - rect.left - LABEL_W) / SNAP_MS) * SNAP_MS, min, origEnd - SNAP_MS);
      newDur = Math.max(SNAP_MIN, Math.round((origEnd - newStart) / 60000 / SNAP_MIN) * SNAP_MIN);
      if (preview) { preview.style.display = "block"; preview.style.left = LABEL_W + xOf(newStart) + "px"; preview.style.width = Math.max(xOf(origEnd) - xOf(newStart), 10) + "px"; preview.style.top = HEAD_H + ri * ROW_H + BAR_TOP + "px"; }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("dragging-active"); if (preview) preview.style.display = "none";
      if (Math.abs(newStart - startMs) >= SNAP_MS) resize.mutate({ id: o.id, hours: newDur / 60, start: msToLocalIso(newStart) });
    };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }

  // måla in timmar: en markerad fas + dra upp ett spann på en maskinrad
  function startPaint(e: React.MouseEvent, row: { id: number }) {
    if (selectedId == null) return;
    if (!(e.target as HTMLElement).classList.contains("g-row")) return; // bara på tom radyta
    e.preventDefault();
    const ri = rowIndexOf(row.id); const preview = previewRef.current;
    const rect = canvasRef.current!.getBoundingClientRect();
    const startMs = Math.round(msFromX(e.clientX - rect.left - LABEL_W) / SNAP_MS) * SNAP_MS;
    let endMs = startMs + SNAP_MS;
    document.body.classList.add("dragging-active");
    const onMove = (ev: MouseEvent) => {
      endMs = Math.max(startMs + SNAP_MS, Math.round(msFromX(ev.clientX - rect.left - LABEL_W) / SNAP_MS) * SNAP_MS);
      if (preview) { preview.style.display = "block"; preview.className = "g-preview paint"; preview.style.left = LABEL_W + xOf(startMs) + "px"; preview.style.width = Math.max(xOf(endMs) - xOf(startMs), 8) + "px"; preview.style.top = HEAD_H + ri * ROW_H + BAR_TOP + "px"; }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("dragging-active");
      if (preview) { preview.style.display = "none"; preview.className = "g-preview"; }
      const mins = Math.round((endMs - startMs) / 60000 / SNAP_MIN) * SNAP_MIN;
      if (mins >= SNAP_MIN) placePart.mutate({ id: selectedId!, start: msToLocalIso(startMs), machine: row.id, hours: mins / 60 });
      setSelectedId(null);
    };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }

  const canvasH = HEAD_H + rows.length * ROW_H;
  const selectedOp = ops.find((o) => o.id === selectedId);
  const busy = schedule.isPending || unschedule.isPending || setStatus.isPending || resize.isPending || placePart.isPending;

  return (
    <>
      <div className="page-head">
        <h1>Produktionsplanering</h1>
        <div className="gantt-toolbar">
          <div className="seg-toggle">
            <button className={view === "compact" ? "active" : ""} onClick={() => { captureAnchor(); setView("compact"); }}>Arbetstid</button>
            <button className={view === "day" ? "active" : ""} onClick={() => { captureAnchor(); setView("day"); }}>Hela dygn</button>
          </div>
          <button className={"btn secondary" + (hideWeekends ? " on" : "")} onClick={() => { captureAnchor(); setHideWeekends((v) => !v); }}>{hideWeekends ? "Visa helger" : "Dölj helger"}</button>
          <button className="iconbtn" title="Zooma ut" onClick={() => { captureAnchor(); setPxph((p) => clamp(Math.round(p / 1.4), 6, 90)); }}>−</button>
          <button className="iconbtn" title="Zooma in" onClick={() => { captureAnchor(); setPxph((p) => clamp(Math.round(p * 1.4), 6, 90)); }}>+</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty"><div className="icon">🏭</div><h3>Inga maskiner</h3><div>Lägg upp maskiner under <strong>Inställningar</strong> först.</div></div>
      ) : (
        <>
          <div className="backlog">
            <div className="backlog-head">
              <h2 style={{ margin: 0 }}>Faser att planera ({backlog.length})</h2>
              <span className="drop-hint">Dra hela fasen till en rad — eller <strong>klicka</strong> för att markera och sedan <strong>måla upp</strong> timmar i schemat.</span>
            </div>
            {backlog.length === 0 ? (
              <div className="subtle">Inga oplanerade faser. Lägg till faser på en order under <strong>Order</strong>.</div>
            ) : (
              <div className="backlog-chips">
                {backlog.map((o) => (
                  <div key={o.id} className={"chip" + (selectedId === o.id ? " selected" : "")} onMouseDown={(e) => beginDrag(e, { kind: "new", opId: o.id, durMin: o.duration_minutes })}>
                    <span className="seq">{posById[o.id]}</span>
                    <strong>{orderNo(o.order_id)}</strong> · {o.name}
                    <span className="dur">{fmtDur(o.duration_minutes)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedOp && (
            <div className="paint-banner">
              🖌 Markerad: <strong>{orderNo(selectedOp.order_id)} · {selectedOp.name}</strong> ({fmtDur(selectedOp.duration_minutes)} kvar) — dra upp ett tidsspann på en maskinrad för att boka in timmar.
              <button className="linkbtn" onClick={() => setSelectedId(null)}>Avbryt</button>
            </div>
          )}
          <div className="gantt2" ref={scrollRef}>
            <div className="g-canvas" ref={canvasRef} style={{ width: LABEL_W + widthPx, height: canvasH }}>
              {visibleDays.filter((d) => d.week % 2 === 1).map((d) => <div key={"wk" + d.i} className="g-weekband" style={{ left: LABEL_W + d.dx, width: dayWidth, height: canvasH }} />)}
              {!hideWeekends && visibleDays.filter((d) => d.weekend).map((d) => <div key={"we" + d.i} className="g-weekend" style={{ left: LABEL_W + d.dx, width: dayWidth, height: canvasH }} />)}
              {visibleDays.map((d) => <div key={"dg" + d.i} className={"g-daygrid" + (d.monday ? " g-weekstart" : "")} style={{ left: LABEL_W + d.dx, height: canvasH }} />)}
              {visibleDays.flatMap((d) => hourList.map((h) => <div key={`hg${d.i}-${h}`} className="g-hourgrid" style={{ left: LABEL_W + d.dx + (h - winStart) * pxph, height: canvasH }} />))}

              <div className="g-head">
                <div className="g-rowlabel" style={{ position: "absolute", zIndex: 6, height: HEAD_H }} />
                {visibleDays.map((d) => (
                  <div key={"dh" + d.i} className={"g-dayhead" + (d.weekend ? " weekend" : "") + (d.monday ? " g-weekstart" : "")} style={{ left: LABEL_W + d.dx, width: dayWidth }}>
                    <span className="dh-date">{d.date.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span className="dh-week">v.{d.week}</span>
                  </div>
                ))}
                {visibleDays.flatMap((d) => hourList.map((h) => <div key={`ht${d.i}-${h}`} className="g-hourtick" style={{ left: LABEL_W + d.dx + (h - winStart) * pxph }}>{pad(h)}</div>))}
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
                const sh = shiftOf(row.id);
                const aS = clamp(shiftS.h + shiftS.m / 60, winStart, winEnd), aE = clamp(shiftE.h + shiftE.m / 60, winStart, winEnd);
                return (
                  <div key={row.id} className={"g-row" + (selectedId != null ? " painting" : "")} style={{ top: HEAD_H + ri * ROW_H }} onMouseDown={(e) => startPaint(e, row)}>
                    <div className="g-rowlabel"><div className="g-rowname">{row.name}</div></div>
                    {mc && aE > aS && visibleDays.filter((d) => !d.weekend).map((d) => (
                      <div key={"av" + d.i} className="g-avail" style={{ left: LABEL_W + d.dx + (aS - winStart) * pxph, width: (aE - aS) * pxph }} />
                    ))}
                    {showNow && <div className="g-now" style={{ left: LABEL_W + xOf(now), height: ROW_H }} />}
                    {(opsByMachine[String(row.id)] ?? []).map((o) => {
                      const s = new Date(o.start_time!).getTime();
                      const e = s + o.duration_minutes * 60000;
                      const otMin = overtimeMinutes(o);
                      const ots = otMin > 0 ? overtimeIntervals(o) : [];
                      const barLeft = xOf(s);
                      return (
                        <div key={o.id} className={"g-bar " + barClass(o)}
                          style={{ left: LABEL_W + barLeft, width: Math.max(xOf(e) - barLeft, 10) }}
                          title={`${orderNo(o.order_id)} · fas ${posById[o.id]}: ${o.name}\n${fmtDur(o.duration_minutes)} totalt${otMin > 0 ? `\n⚠ ${fmtDur(otMin)} övertid (utanför arbetstid)` : ""}\nKlicka för status · dra för att flytta`}
                          onMouseDown={(ev) => beginDrag(ev, { kind: "move", opId: o.id, origMs: s, origMachine: o.machine_id, durMin: o.duration_minutes, overtime: o.overtime })}>
                          {ots.map((iv, i) => (
                            <div key={i} className="g-ot" style={{ left: xOf(iv.start) - barLeft, width: Math.max(xOf(iv.end) - xOf(iv.start), 2) }} />
                          ))}
                          <span className="resize-handle left" title="Dra för att korta fasen från början" onMouseDown={(ev) => beginResizeStart(ev, o)} />
                          <span className="bar-label">{otMin > 0 && <span className="ot-badge" title={`${fmtDur(otMin)} övertid`}>⚠</span>}<span className="seq light">{posById[o.id]}</span>{orderNo(o.order_id)} · {o.name}</span>
                          <span className="resize-handle" title="Dra för att korta fasen — resten blir oplanerad" onMouseDown={(ev) => beginResize(ev, o)} />
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
            <span><span className="swatch" style={{ background: "#16a34a" }} />Klar</span>
            <span><span className="swatch" style={{ background: "#2563eb" }} />Pågår</span>
            <span><span className="swatch" style={{ background: "#ce0e2d" }} />Försenad</span>
            <span><span className="swatch ot" />⚠ Övertid</span>
            <span style={{ marginLeft: "auto" }}>💡 Klicka på en fas för status/övertid · dra för att flytta.</span>
          </div>
        </>
      )}

      {popState && (() => {
        const o = ops.find((x) => x.id === popState.opId);
        return (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 205 }} onMouseDown={() => setPop(null)} />
            <div className="popover" style={{ left: Math.min(popState.x, window.innerWidth - 210), top: Math.min(popState.y, window.innerHeight - 230) }}>
              <div className="pop-title">{o ? `${orderNo(o.order_id)} · ${o.name}` : ""}</div>
              <button onClick={() => { setStatus.mutate({ id: popState.opId, s: "done" }); setPop(null); }}><span className="dot" style={{ background: "#16a34a" }} />Markera klar</button>
              <button onClick={() => { setStatus.mutate({ id: popState.opId, s: "delayed" }); setPop(null); }}><span className="dot" style={{ background: "#ce0e2d" }} />Markera försenad</button>
              <button onClick={() => { setStatus.mutate({ id: popState.opId, s: "running" }); setPop(null); }}><span className="dot" style={{ background: "#2563eb" }} />Markera pågår</button>
              <button onClick={() => { setStatus.mutate({ id: popState.opId, s: "planned" }); setPop(null); }}><span className="dot" style={{ background: "#94a3b8" }} />Återställ status</button>
              <button onClick={() => { unschedule.mutate(popState.opId); setPop(null); }}><span className="dot" style={{ background: "#111418" }} />Gör oplanerad</button>
            </div>
          </>
        );
      })()}

      {warn && <div className="replan-toast warn">⚠ {warn}</div>}
      {busy && !warn && <div className="replan-toast">⟳ Uppdaterar schema…</div>}
    </>
  );
}
