import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Modal from "../components/Modal";
import { ORDER_STATUS, PRIORITIES, prioLabel, onErr } from "../lib";

export default function Orders() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["customers"], queryFn: api.customers });

  const EMPTY = { order_no: "", customer_id: 0, priority: "medium", due_date: "" };
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const create = useMutation({
    mutationFn: () => api.createOrder({ order_no: form.order_no, customer_id: form.customer_id || null, priority: form.priority, due_date: new Date(form.due_date).toISOString() }),
    onSuccess: (o: any) => { qc.invalidateQueries({ queryKey: ["orders"] }); setShowNew(false); setForm(EMPTY); if (o?.id) nav(`/orders/${o.id}`); },
    onError: onErr,
  });
  const custName = (id: number | null) => customers.find((c) => c.id === id)?.name ?? "–";

  return (
    <>
      <div className="page-head">
        <h1>Order</h1>
        <button className="btn" onClick={() => setShowNew(true)}>＋ Ny order</button>
      </div>

      {orders.length === 0 ? (
        <div className="empty"><div className="icon">📋</div><h3>Inga order ännu</h3><div>Skapa din första order uppe till höger.</div></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ordernr</th><th>Kund</th><th>Prioritet</th><th>Leverans</th><th>Status</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => nav(`/orders/${o.id}`)}>
                  <td style={{ fontWeight: 600 }}>{o.order_no}</td>
                  <td>{custName(o.customer_id)}</td>
                  <td><span className={"prio " + o.priority}>{prioLabel(o.priority)}</span></td>
                  <td>{new Date(o.due_date).toLocaleDateString("sv-SE")}</td>
                  <td><span className={"badge " + o.status}>{ORDER_STATUS[o.status] ?? o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <Modal title="Ny order" onClose={() => setShowNew(false)}>
          <label className="field">Ordernummer<input value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} /></label>
          <label className="field">Kund
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: Number(e.target.value) })}>
              <option value={0}>— ingen —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="form-row">
            <label className="field" style={{ flex: 1 }}>Prioritet
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>Leveransdatum<input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
          </div>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setShowNew(false)}>Avbryt</button>
            <button className="btn" disabled={!form.order_no || !form.due_date || create.isPending} onClick={() => create.mutate()}>Skapa order</button>
          </div>
        </Modal>
      )}
    </>
  );
}
