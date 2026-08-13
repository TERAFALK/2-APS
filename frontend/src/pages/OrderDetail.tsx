import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ORDER_STATUS, PHASE_STATUS, prioLabel, onErr } from "../lib";

export default function OrderDetail() {
  const { id } = useParams();
  const oid = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["customers"], queryFn: api.customers });
  const { data: ops = [] } = useQuery<any[]>({ queryKey: ["operations"], queryFn: api.operations });
  const { data: moments = [] } = useQuery<any[]>({ queryKey: ["momentTypes"], queryFn: api.momentTypes });
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });

  const order = orders.find((o) => o.id === oid);
  const inval = () => { qc.invalidateQueries({ queryKey: ["operations"] }); qc.invalidateQueries({ queryKey: ["orders"] }); };
  const phases = ops.filter((p) => p.order_id === oid).sort((a, b) => a.sequence - b.sequence);
  const custName = order ? (customers.find((c) => c.id === order.customer_id)?.name ?? "–") : "";
  const machineName = (mid: number | null) => machines.find((m) => m.id === mid)?.name ?? "—";

  const empty = { moment_type_id: 0, hours: 8 };
  const [form, setForm] = useState(empty);
  const momentName = (id: number) => moments.find((m) => m.id === id)?.name ?? "";

  const add = useMutation({
    mutationFn: () => api.addPhase(oid, { name: momentName(form.moment_type_id), moment_type_id: form.moment_type_id, hours: Number(form.hours) }),
    onSuccess: () => { inval(); setForm(empty); }, onError: onErr,
  });
  const chainLock = useMutation({ mutationFn: (v: { id: number; value: boolean }) => api.setPhaseChainLock(v.id, v.value), onSuccess: inval, onError: onErr });
  const del = useMutation({ mutationFn: (pid: number) => api.deletePhase(pid), onSuccess: inval, onError: onErr });
  const setStatus = useMutation({ mutationFn: (v: { id: number; s: string }) => api.setPhaseStatus(v.id, v.s), onSuccess: inval, onError: onErr });
  const delOrder = useMutation({ mutationFn: () => api.deleteOrder(oid), onSuccess: () => { inval(); nav("/orders"); }, onError: onErr });

  if (!order) return <div className="subtle">Laddar…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb" onClick={() => nav("/orders")}>← Order</div>
          <h1>{order.order_no}</h1>
        </div>
        <button className="linkbtn danger" onClick={() => confirm(`Ta bort order ${order.order_no}?`) && delOrder.mutate()}>Ta bort order</button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <div><div className="subtle">Kund</div><div style={{ fontWeight: 550 }}>{custName}</div></div>
          <div><div className="subtle">Prioritet</div><span className={"prio " + order.priority}>{prioLabel(order.priority)}</span></div>
          <div><div className="subtle">Leveransdatum</div><div style={{ fontWeight: 550 }}>{new Date(order.due_date).toLocaleDateString("sv-SE")}</div></div>
          <div><div className="subtle">Status</div><span className={"badge " + order.status}>{ORDER_STATUS[order.status] ?? order.status}</span></div>
        </div>
      </div>

      <div className="section">
        <div className="card-head">
          <h2>Faser</h2>
          <span className="subtle">🔗 markerar att efterföljande faser flyttas med när fasen flyttas i schemat.</span>
        </div>
        {phases.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead><tr><th style={{ width: 36 }}>#</th><th>Moment</th><th>Timmar</th><th>Maskin</th><th>Status</th><th style={{ width: 250 }}>Åtgärd</th></tr></thead>
              <tbody>
                {phases.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td>
                      {p.name}
                      {p.chain_locked && <span className="chain-badge inline" title="Efterföljande faser flyttas med">🔗</span>}
                    </td>
                    <td>{(p.duration_minutes / 60).toFixed(1).replace(".", ",").replace(",0", "")} h</td>
                    <td>{p.start_time ? machineName(p.machine_id) : "—"}</td>
                    <td><span className={"badge " + (p.start_time || p.status !== "planned" ? p.status : "draft")}>{p.start_time || p.status !== "planned" ? PHASE_STATUS[p.status] : "Ej planerad"}</span></td>
                    <td>
                      <button className="linkbtn" onClick={() => setStatus.mutate({ id: p.id, s: "done" })}>Klar</button>
                      <button className="linkbtn danger" onClick={() => setStatus.mutate({ id: p.id, s: "delayed" })}>Försenad</button>
                      <button className="linkbtn" onClick={() => setStatus.mutate({ id: p.id, s: "planned" })}>Återställ</button>
                      <button className="linkbtn" onClick={() => chainLock.mutate({ id: p.id, value: !p.chain_locked })}>{p.chain_locked ? "Lås upp" : "Lås"}</button>
                      <button className="linkbtn danger" onClick={() => del.mutate(p.id)}>Ta bort</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card">
          <div className="form-row">
            <label className="field">Moment
              <select value={form.moment_type_id} onChange={(e) => setForm({ ...form, moment_type_id: Number(e.target.value) })}>
                <option value={0}>Välj…</option>
                {moments.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="field">Timmar<input type="number" min={0.5} step={0.5} value={form.hours} style={{ width: 100 }} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} /></label>
            <button className="btn secondary" disabled={!form.moment_type_id || add.isPending} onClick={() => add.mutate()}>＋ Lägg till fas</button>
          </div>
          {moments.length === 0 && <div className="subtle" style={{ marginTop: 8 }}>Inga momenttyper ännu — lägg upp dem under Inställningar.</div>}
          <div className="subtle" style={{ marginTop: 8 }}>Maskin väljs när du drar ut fasen i Planering.</div>
        </div>
      </div>
    </>
  );
}
