import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export default function Orders() {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });
  const { data: products = [] } = useQuery<any[]>({ queryKey: ["products"], queryFn: api.products });

  const [form, setForm] = useState({
    order_no: "",
    product_id: 0,
    quantity: 1,
    priority: 100,
    due_date: "",
  });
  const [err, setErr] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createOrder({
        ...form,
        product_id: Number(form.product_id),
        quantity: Number(form.quantity),
        priority: Number(form.priority),
        due_date: new Date(form.due_date).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      setForm({ order_no: "", product_id: 0, quantity: 1, priority: 100, due_date: "" });
      setErr("");
    },
    onError: (e: any) => setErr(e.message),
  });

  return (
    <>
      <h1>Produktionsorder</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <label>
            Ordernr
            <br />
            <input value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} />
          </label>
          <label>
            Produkt
            <br />
            <select
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: Number(e.target.value) })}
            >
              <option value={0}>Välj…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.article_no} — {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Antal
            <br />
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              style={{ width: 70 }}
            />
          </label>
          <label>
            Prioritet
            <br />
            <input
              type="number"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              style={{ width: 70 }}
            />
          </label>
          <label>
            Leveransdatum
            <br />
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </label>
          <button
            className="btn"
            disabled={!form.order_no || !form.product_id || !form.due_date || create.isPending}
            onClick={() => create.mutate()}
          >
            Skapa order
          </button>
        </div>
        {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      </div>

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
