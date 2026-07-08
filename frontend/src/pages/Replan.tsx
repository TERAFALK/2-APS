import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export default function Replan() {
  const { data } = useQuery({ queryKey: ["diff"], queryFn: api.planDiff });
  const changes: any[] = data?.changes ?? [];

  return (
    <>
      <h1>Om-planering — skillnad mot föregående plan</h1>
      <p style={{ color: "var(--muted)" }}>
        {data?.message ??
          `${data?.total_changes ?? 0} förändringar mellan version ${data?.base_version ?? "–"} och ${
            data?.new_version ?? "–"
          }.`}
      </p>
      {changes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Operation</th>
              <th>Order</th>
              <th>Typ</th>
              <th>Förskjutning</th>
              <th>Maskin</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c, i) => (
              <tr key={i}>
                <td>{c.op}</td>
                <td>{c.order_id}</td>
                <td>{c.type}</td>
                <td>
                  {c.shift_minutes != null
                    ? `${c.shift_minutes > 0 ? "+" : ""}${c.shift_minutes} min`
                    : "–"}
                </td>
                <td>
                  {c.from_machine != null && c.from_machine !== c.to_machine
                    ? `${c.from_machine} → ${c.to_machine}`
                    : c.to_machine ?? "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
