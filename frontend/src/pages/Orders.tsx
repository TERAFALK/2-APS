import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import Modal from "../components/Modal";
import { ORDER_STATUS, PHASE_STATUS, PRIORITIES, prioLabel, onErr } from "../lib";

export default function Orders() {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["customers"], queryFn: api.customers });
  const inval = () => { qc.invalidateQueries({ queryKey: ["orders"] }); qc.invalidateQueries({ queryKey: ["operations"] }); };

  const EMPTY = { order_no: "", customer_id: 0, priority: "medium", due_date: "" };
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: () => api.createOrder({
      order_no: form.order_no, customer_id: form.customer_id || null,
      priority: form.priority, due_date: new Date(form.due_date).toISOString(),
    }),
    onSuccess: () => { inval(); setShowNew(false); setForm(EMPTY); }, onError: onErr,
  });
  const delOrder = useMutation({ mutationFn: (id: number) => api.deleteOrder(id), onSuccess: inval, onError: onErr });
  const custName = (id: number | null) => customers.find((c) => c.id === id)?.name ?? "–";

  return (
    <>
      <div className="page-head">
        <h1>Order</h1>
        <button className="btn" onClick={() => setShowNew(true)}>＋ Ny order</button>
      </div>

      {orders.length === 0 ? (
        <div className="empty"><div className="icon">📋</div><h3>Inga order ännu</h3><div>Skapa din första order med knappen uppe till höger.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map((o) => (
            <div key={o.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{o.order_no}</strong>
                  <span className="subtle"> · {custName(o.customer_id)} · lev {new Date(o.due_date).toLocaleDateString("sv-SE")}</span>
                  <span className={"prio " + o.priority} style={{ marginLeft: 10 }}>{prioLabel(o.priority)}</span>
                  <span className={"badge " + o.status} style={{ marginLeft: 6 }}>{ORDER_STATUS[o.status] ?? o.status}</span>
                </div>
                <div>
                  <button className="btn secondary" onClick={() => setOpen(open === o.id ? null : o.id)}>{open === o.id ? "Dölj faser" : "Öppna"}</button>
                  <button className="linkbtn danger" onClick={() => confirm(`Ta bort order ${o.order_no}?`) && delOrder.mutate(o.id)}>Ta bort</button>
                </div>
              </div>
              {open === o.id && <Phases orderId={o.id} onChange={inval} />}
            </div>
          ))}
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
  const setStatus = useMutation({ mutationFn: (v: { id: number; s: string }) => api.setPhaseStatus(v.id, v.s), onSuccess: inval, onError: onErr });

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      {phases.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table>
            <thead><tr><th style={{ width: 36 }}>#</th><th>Moment</th><th>Maskin</th><th>Timmar</th><th>Status</th><th style={{ width: 240 }}>Åtgärd</th></tr></thead>
            <tbody>
              {phases.map((p, i) => (
                <tr key={p.id}>
                  <td><strong>{i + 1}</strong></td>
                  <td>{p.name}</td>
                  <td>{machineName(p.machine_id)}</td>
                  <td>{(p.duration_minutes / 60).toFixed(1)} h</td>
                  <td><span className={"badge " + (p.start_time || p.status !== "planned" ? p.status : "draft")}>{p.start_time || p.status !== "planned" ? PHASE_STATUS[p.status] : "Backlog"}</span></td>
                  <td>
                    <button className="linkbtn" onClick={() => setStatus.mutate({ id: p.id, s: "done" })}>Klar</button>
                    <button className="linkbtn danger" onClick={() => setStatus.mutate({ id: p.id, s: "delayed" })}>Försenad</button>
                    <button className="linkbtn" onClick={() => setStatus.mutate({ id: p.id, s: "planned" })}>Återställ</button>
                    <button className="linkbtn danger" onClick={() => del.mutate(p.id)}>Ta bort</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      {moments.length === 0 && <div className="subtle" style={{ marginTop: 8 }}>Inga momenttyper ännu — lägg upp dem under Inställningar.</div>}
    </div>
  );
}
