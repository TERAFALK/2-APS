import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

const STATUS: Record<string, string> = {
  draft: "Utkast", released: "Frisläppt", scheduled: "Schemalagd",
  in_progress: "Pågår", done: "Klar", cancelled: "Avbruten",
};
const onErr = (e: any) => alert(e?.message || "Något gick fel");

export default function Orders() {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["customers"], queryFn: api.customers });
  const inval = () => { qc.invalidateQueries({ queryKey: ["orders"] }); qc.invalidateQueries({ queryKey: ["operations"] }); };

  const empty = { order_no: "", customer_id: 0, priority: 100, due_date: "" };
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: () => api.createOrder({
      order_no: form.order_no,
      customer_id: form.customer_id || null,
      priority: Number(form.priority),
      due_date: new Date(form.due_date).toISOString(),
    }),
    onSuccess: () => { inval(); setForm(empty); }, onError: onErr,
  });
  const delOrder = useMutation({ mutationFn: (id: number) => api.deleteOrder(id), onSuccess: inval, onError: onErr });
  const custName = (id: number | null) => customers.find((c) => c.id === id)?.name ?? "–";

  return (
    <>
      <div className="page-head"><h1>Order</h1><span className="subtle">{orders.length} order</span></div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Ny order</h2>
        <div className="form-row">
          <label className="field">Ordernr<input value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} /></label>
          <label className="field">Kund
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: Number(e.target.value) })}>
              <option value={0}>— ingen —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">Prioritet<input type="number" value={form.priority} style={{ width: 90 }} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></label>
          <label className="field">Leveransdatum<input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
          <button className="btn" disabled={!form.order_no || !form.due_date || create.isPending} onClick={() => create.mutate()}>Skapa order</button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="empty"><div className="icon">📋</div><h3>Inga order ännu</h3><div>Skapa din första order ovan, lägg sedan till faser.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map((o) => (
            <div key={o.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{o.order_no}</strong>
                  <span className="subtle"> · {custName(o.customer_id)} · prio {o.priority} · lev {new Date(o.due_date).toLocaleDateString("sv-SE")}</span>
                  <span className={"badge " + o.status} style={{ marginLeft: 10 }}>{STATUS[o.status] ?? o.status}</span>
                </div>
                <div>
                  <button className="btn secondary" onClick={() => setOpen(open === o.id ? null : o.id)}>{open === o.id ? "Dölj faser" : "Faser"}</button>
                  <button className="linkbtn danger" onClick={() => confirm(`Ta bort order ${o.order_no}?`) && delOrder.mutate(o.id)}>Ta bort</button>
                </div>
              </div>
              {open === o.id && <Phases orderId={o.id} onChange={inval} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Phases({ orderId, onChange }: { orderId: number; onChange: () => void }) {
  const qc = useQueryClient();
  const { data: ops = [] } = useQuery<any[]>({ queryKey: ["operations"], queryFn: api.operations });
  const { data: moments = [] } = useQuery<any[]>({ queryKey: ["momentTypes"], queryFn: api.momentTypes });
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const inval = () => { qc.invalidateQueries({ queryKey: ["operations"] }); onChange(); };

  const phases = ops.filter((p) => p.order_id === orderId).sort((a, b) => a.sequence - b.sequence);
  const empty = { name: "", machine_id: 0, hours: 8 };
  const [form, setForm] = useState(empty);
  const machineName = (id: number | null) => machines.find((m) => m.id === id)?.name ?? "—";

  const add = useMutation({
    mutationFn: () => api.addPhase(orderId, { name: form.name, machine_id: form.machine_id || null, hours: Number(form.hours) }),
    onSuccess: () => { inval(); setForm(empty); }, onError: onErr,
  });
  const del = useMutation({ mutationFn: (id: number) => api.deletePhase(id), onSuccess: inval, onError: onErr });

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      {phases.length > 0 && (
        <table style={{ marginBottom: 12 }}>
          <thead><tr><th style={{ width: 40 }}>#</th><th>Moment</th><th>Maskin</th><th>Timmar</th><th>Status</th><th style={{ width: 90 }}></th></tr></thead>
          <tbody>
            {phases.map((p, i) => (
              <tr key={p.id}>
                <td><strong>{i + 1}</strong></td>
                <td>{p.name}</td>
                <td>{machineName(p.machine_id)}</td>
                <td>{(p.duration_minutes / 60).toFixed(1)} h</td>
                <td>{p.start_time ? <span className="badge scheduled">Planerad</span> : <span className="badge draft">Backlog</span>}</td>
                <td><button className="linkbtn danger" onClick={() => del.mutate(p.id)}>Ta bort</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="form-row">
        <label className="field">Moment
          <select value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}>
            <option value="">Välj…</option>
            {moments.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </label>
        <label className="field">Maskin
          <select value={form.machine_id} onChange={(e) => setForm({ ...form, machine_id: Number(e.target.value) })}>
            <option value={0}>Välj…</option>
            {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="field">Timmar<input type="number" min={0.5} step={0.5} value={form.hours} style={{ width: 90 }} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} /></label>
        <button className="btn secondary" disabled={!form.name || add.isPending} onClick={() => add.mutate()}>＋ Lägg till fas</button>
      </div>
      {moments.length === 0 && <div className="subtle" style={{ marginTop: 8 }}>Inga momenttyper ännu — lägg upp dem under Grunddata.</div>}
    </div>
  );
}
