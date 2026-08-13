import { useEffect, useMemo, useRef, useState } from "react";

type Item = { id: number; label: string; sub?: string };

/** Sökbar dropdown — skriv för att filtrera, klicka för att välja. */
export default function SearchSelect({
  items, value, onChange, placeholder = "Sök…", allowEmpty = true, emptyLabel = "— ingen —",
}: {
  items: Item[]; value: number | null; onChange: (id: number | null) => void;
  placeholder?: string; allowEmpty?: boolean; emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = items.find((i) => i.id === value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 100);
    return items.filter((i) => (i.label + " " + (i.sub ?? "")).toLowerCase().includes(s)).slice(0, 100);
  }, [items, q]);

  return (
    <div className="ss" ref={boxRef}>
      <button type="button" className={"ss-control" + (open ? " open" : "")} onClick={() => { setOpen((v) => !v); setQ(""); }}>
        <span className={selected ? "" : "ss-placeholder"}>{selected ? selected.label : emptyLabel}</span>
        <span className="ss-caret">▾</span>
      </button>
      {open && (
        <div className="ss-menu">
          <input autoFocus className="ss-search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ss-list">
            {allowEmpty && (
              <button type="button" className="ss-item" onClick={() => { onChange(null); setOpen(false); }}>{emptyLabel}</button>
            )}
            {filtered.map((i) => (
              <button type="button" key={i.id} className={"ss-item" + (i.id === value ? " sel" : "")}
                onClick={() => { onChange(i.id); setOpen(false); }}>
                <span>{i.label}</span>
                {i.sub && <span className="ss-sub">{i.sub}</span>}
              </button>
            ))}
            {filtered.length === 0 && <div className="ss-empty">Inga träffar</div>}
          </div>
        </div>
      )}
    </div>
  );
}
