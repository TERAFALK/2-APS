import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

function Card({ label, value, red }: { label: string; value: any; red?: boolean }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={"value" + (red ? " red" : "")}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { data } = useQuery({ queryKey: ["kpi"], queryFn: api.kpi });
  const { data: util = [] } = useQuery<any[]>({ queryKey: ["util"], queryFn: api.utilization });

  return (
    <>
      <h1>Produktionsöversikt</h1>
      <div className="cards">
        <Card label="Aktiva order" value={data?.orders_active ?? "–"} />
        <Card label="Färdiga order" value={data?.orders_done ?? "–"} />
        <Card label="Försenade order" value={data?.orders_late ?? "–"} red />
        <Card label="Leveransprecision" value={(data?.delivery_precision_pct ?? "–") + " %"} />
        <Card label="Total order" value={data?.orders_total ?? "–"} />
        <Card label="Schemaversion" value={data?.active_schedule_version ?? "–"} />
      </div>

      <h1 style={{ marginTop: 32 }}>Maskinutnyttjande & flaskhalsar</h1>
      <div className="card">
        {util.length === 0 && <span style={{ color: "var(--muted)" }}>Kör en planering först.</span>}
        {util.map((u) => (
          <div key={u.machine_id} style={{ margin: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>
                {u.machine}
                {u.utilization_pct >= 85 && (
                  <span style={{ color: "var(--red)", fontWeight: 700 }}> ⚠ flaskhals</span>
                )}
              </span>
              <span>{u.utilization_pct}%</span>
            </div>
            <div style={{ background: "#f0f1f4", borderRadius: 6, height: 14, marginTop: 4 }}>
              <div
                style={{
                  width: `${Math.min(u.utilization_pct, 100)}%`,
                  height: 14,
                  borderRadius: 6,
                  background: u.utilization_pct >= 85 ? "var(--red)" : "#3b82f6",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
