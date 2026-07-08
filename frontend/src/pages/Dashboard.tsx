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
  const { data: util = [] } = useQuery<any[]>({ queryKey: ["util"], queryFn: api.utilization });

  const precision = data?.delivery_precision_pct;

  return (
    <>
      <div className="page-head">
        <h1>Produktionsöversikt</h1>
        <span className="subtle">Realtidsstatus för aktivt schema</span>
      </div>

      <div className="cards">
        <Kpi label="Aktiva order" value={data?.orders_active ?? "–"} />
        <Kpi label="Färdiga order" value={data?.orders_done ?? "–"} tone="green" />
        <Kpi label="Försenade order" value={data?.orders_late ?? "–"} tone={data?.orders_late ? "red" : undefined} />
        <Kpi
          label="Leveransprecision"
          value={precision != null ? precision + " %" : "–"}
          tone={precision != null && precision >= 95 ? "green" : precision != null && precision < 80 ? "red" : undefined}
        />
        <Kpi label="Totalt order" value={data?.orders_total ?? "–"} />
        <Kpi label="Schemalagda order" value={data?.orders_scheduled ?? "–"} />
      </div>

      <div className="section">
        <h2>Maskinutnyttjande & flaskhalsar</h2>
        {util.length === 0 ? (
          <div className="empty">
            <div className="icon">📊</div>
            <h3>Inget schema ännu</h3>
            <div>Lägg upp grunddata och order, kör sedan planeringen i Gantt-vyn.</div>
          </div>
        ) : (
          <div className="card">
            {util.map((u) => {
              const hot = u.utilization_pct >= 85;
              return (
                <div key={u.machine_id} className="util-row">
                  <div className="util-top">
                    <span>
                      {u.machine} {hot && <span className="flag">⚠ flaskhals</span>}
                    </span>
                    <span>{u.utilization_pct}%</span>
                  </div>
                  <div className="util-track">
                    <div
                      className={"util-fill" + (hot ? " hot" : "")}
                      style={{ width: `${Math.min(u.utilization_pct, 100)}%` }}
                    />
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
