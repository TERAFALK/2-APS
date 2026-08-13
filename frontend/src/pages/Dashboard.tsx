import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

function Kpi({ label, value, tone }: { label: string; value: any; tone?: "red" | "green" }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className={"value" + (tone ? " " + tone : "")}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { data } = useQuery({ queryKey: ["kpi"], queryFn: api.kpi });
  const { data: load = [] } = useQuery<any[]>({ queryKey: ["load"], queryFn: api.load });

  const precision = data?.delivery_precision_pct;
  const avgLoad = load.length ? Math.round(load.reduce((s, m) => s + m.load_pct, 0) / load.length) : null;
  const totalOt = load.reduce((s, m) => s + (m.overtime_h || 0), 0);

  return (
    <>
      <div className="page-head">
        <h1>Produktionsöversikt</h1>
        <span className="subtle">Beläggning denna vecka</span>
      </div>

      <div className="cards">
        <Kpi label="Aktiva order" value={data?.orders_active ?? "–"} />
        <Kpi label="Schemalagda order" value={data?.orders_scheduled ?? "–"} />
        <Kpi label="Försenade order" value={data?.orders_late ?? "–"} tone={data?.orders_late ? "red" : undefined} />
        <Kpi label="Leveransprecision" value={precision != null ? precision + " %" : "–"} tone={precision != null && precision >= 95 ? "green" : precision != null && precision < 80 ? "red" : undefined} />
        <Kpi label="Snittbeläggning" value={avgLoad != null ? avgLoad + " %" : "–"} tone={avgLoad != null && avgLoad >= 90 ? "red" : undefined} />
        <Kpi label="Övertid denna vecka" value={totalOt > 0 ? totalOt.toFixed(1) + " h" : "0 h"} tone={totalOt > 0 ? "red" : undefined} />
      </div>

      <div className="section">
        <h2>Beläggningsgrad per maskin (denna vecka)</h2>
        <div className="subtle" style={{ marginBottom: 12 }}>Hur mycket av veckans arbetstid som är bokad — håll koll på ledig kapacitet för akutjobb.</div>
        {load.length === 0 ? (
          <div className="empty"><div className="icon">📊</div><h3>Inga maskiner</h3><div>Lägg upp maskiner och planera faser.</div></div>
        ) : (
          <div className="card">
            {load.map((m) => {
              const hot = m.load_pct >= 90, mid = m.load_pct >= 70 && m.load_pct < 90;
              return (
                <div key={m.machine_id} className="util-row">
                  <div className="util-top">
                    <span>
                      {m.machine} <span className="subtle">· {m.busy_h} h bokat, {m.free_h} h ledigt</span>
                      {m.overtime_h > 0 && <span className="ot-tag">⚠ {m.overtime_h} h övertid</span>}
                    </span>
                    <span style={{ fontWeight: 600, color: hot ? "var(--red)" : undefined }}>{m.load_pct}%</span>
                  </div>
                  <div className="util-track">
                    <div className="util-fill" style={{ width: `${Math.min(m.load_pct, 100)}%`, background: hot ? "var(--red)" : mid ? "var(--amber)" : "var(--green)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
