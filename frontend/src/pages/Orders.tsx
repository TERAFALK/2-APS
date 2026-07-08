import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";

const STATUS_LABEL: Record<string, string> = {
  draft: "Utkast",
  released: "Frisläppt",
  scheduled: "Schemalagd",
  in_progress: "Pågår",
  done: "Klar",
  cancelled: "Avbruten",
};

export default function Orders() {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });
  const { data: products = [] } = useQuery<any[]>({ queryKey: ["products"], queryFn: api.products });

  const empty = { order_no: "", product_id: 0, quantity: 1, priority: 100, due_date: "" };
  const [form, setForm] = useState(empty);
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
      setForm(empty);
      setErr("");
    },
    onError: (e: any) => setErr(e.message),
  });

  return (
    <>
      <div className="page-head">
        <h1>Produktionsorder</h1>
        <span className="subtle">{orders.length} order</span>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Ny order</h2>
        {products.length === 0 ? (
          <div className="subtle">
            Inga produkter ännu — lägg upp minst en produkt med routing under{" "}
            <Link to="/masterdata" style={{ color: "var(--red)", fontWeight: 600 }}>Grunddata</Link> först.
          </div>
        ) : (
          <>
            <div className="form-row">
              <label className="field">
                Ordernr
                <input value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} />
              </label>
              <label className="field">
                Produkt
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
              <label className="field">
                Antal
                <input type="number" min={1} value={form.quantity} style={{ width: 80 }}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
              </label>
              <label className="field">
                Prioritet (lägre = viktigare)
                <input type="number" value={form.priority} style={{ width: 90 }}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
              </label>
              <label className="field">
                Leveransdatum
                <input type="date" value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </label>
              <button
                className="btn"
                disabled={!form.order_no || !form.product_id || !form.due_date || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "Skapar…" : "Skapa order"}
              </button>
            </div>
            {err && <div className="err">{err}</div>}
          </>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="empty">
          <div className="icon">📋</div>
          <h3>Inga order ännu</h3>
          <div>Skapa din första produktionsorder i formuläret ovan.</div>
        </div>
      ) : (
        <div className="table-wrap">
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
                  <td style={{ fontWeight: 600 }}>{o.order_no}</td>
                  <td>{o.quantity}</td>
                  <td>{o.priority}</td>
                  <td>{new Date(o.due_date).toLocaleDateString("sv-SE")}</td>
                  <td>
                    <span className={"badge " + o.status}>{STATUS_LABEL[o.status] ?? o.status}</span>
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
