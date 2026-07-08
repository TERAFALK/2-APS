import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export default function Replan() {
  const { data } = useQuery({ queryKey: ["diff"], queryFn: api.planDiff });
  const changes: any[] = data?.changes ?? [];

  return (
    <>
      <div className="page-head">
        <h1>Om-planering</h1>
        <span className="subtle">
          {data?.message ??
            `${data?.total_changes ?? 0} förändringar (v${data?.base_version ?? "–"} → v${data?.new_version ?? "–"})`}
        </span>
      </div>
      {changes.length === 0 ? (
        <div className="empty">
          <div className="icon">🔄</div>
          <h3>Inga planändringar</h3>
          <div>Kör planeringen minst två gånger så visas skillnaderna här.</div>
        </div>
      ) : (
        <div className="table-wrap">
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
        </div>
      )}
    </>
  );
}
