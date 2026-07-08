import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export default function Orders() {
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });
  return (
    <>
      <h1>Produktionsorder</h1>
      <table>
        <thead>
          <tr>
            <th>Ordernr</th>
            <th>Antal</th>
            <th>Prioritet</th>
            <th>Leveransdatum</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.order_no}</td>
              <td>{o.quantity}</td>
              <td>{o.priority}</td>
              <td>{new Date(o.due_date).toLocaleDateString("sv-SE")}</td>
              <td>{o.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
