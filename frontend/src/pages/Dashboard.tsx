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
    </>
  );
}
