import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import Modal from "../components/Modal";
import { ORDER_STATUS, prioLabel, onErr } from "../lib";

const EMPTY = { name: "", customer_no: "", org_no: "", contact_email: "", contact_phone: "", address: "", notes: "" };

function CustomerForm({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const f = (k: string) => (e: any) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <label className="field">Kundnamn<input value={value.name} onChange={f("name")} /></label>
      <div className="form-row">
        <label className="field" style={{ flex: 1 }}>Kundnummer<input value={value.customer_no} onChange={f("customer_no")} /></label>
        <label className="field" style={{ flex: 1 }}>Organisationsnummer<input value={value.org_no} onChange={f("org_no")} /></label>
      </div>
      <div className="form-row">
        <label className="field" style={{ flex: 1 }}>E-post<input value={value.contact_email} onChange={f("contact_email")} /></label>
        <label className="field" style={{ flex: 1 }}>Telefon<input value={value.contact_phone} onChange={f("contact_phone")} /></label>
      </div>
      <label className="field">Adress<input value={value.address} onChange={f("address")} /></label>
      <label className="field">Anteckningar<textarea rows={3} value={value.notes} onChange={f("notes")} /></label>
    </>
  );
}

export default function Customers() {
  const qc = useQueryClient();
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["customers"], queryFn: api.customers });
  const inval = () => qc.invalidateQueries({ queryKey: ["customers"] });

  const [showNew, setShowNew] = useState(false);
  const [newC, setNewC] = useState(EMPTY);
  const [openId, setOpenId] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: () => api.createCustomer(newC),
    onSuccess: () => { inval(); setShowNew(false); setNewC(EMPTY); }, onError: onErr,
  });

  return (
    <>
      <div className="page-head">
        <h1>Kunder</h1>
        <button className="btn" onClick={() => setShowNew(true)}>＋ Ny kund</button>
      </div>

      {customers.length === 0 ? (
        <div className="empty"><div className="icon">👥</div><h3>Inga kunder ännu</h3><div>Lägg till din första kund med knappen uppe till höger.</div></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kund</th><th>Kundnr</th><th>Org.nr</th><th>Kontakt</th><th style={{ width: 90 }}></th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.customer_no || "–"}</td>
                  <td>{c.org_no || "–"}</td>
                  <td>{c.contact_email}{c.contact_phone ? ` · ${c.contact_phone}` : ""}</td>
                  <td><button className="linkbtn" onClick={() => setOpenId(c.id)}>Öppna</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <Modal title="Ny kund" onClose={() => setShowNew(false)}>
          <CustomerForm value={newC} onChange={setNewC} />
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setShowNew(false)}>Avbryt</button>
            <button className="btn" disabled={!newC.name || create.isPending} onClick={() => create.mutate()}>Skapa kund</button>
          </div>
        </Modal>
      )}

      {openId != null && <CustomerDetail id={openId} onClose={() => setOpenId(null)} onSaved={inval} />}
    </>
  );
}

function CustomerDetail({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["customers"], queryFn: api.customers });
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders", id], queryFn: () => api.orders() });
  const customer = customers.find((c) => c.id === id);
  const [form, setForm] = useState<any>(customer ?? EMPTY);

  const save = useMutation({
    mutationFn: () => api.updateCustomer(id, form),
    onSuccess: () => { onSaved(); qc.invalidateQueries({ queryKey: ["orders"] }); onClose(); }, onError: onErr,
  });
  const custOrders = orders.filter((o) => o.customer_id === id);

  return (
    <Modal title={`Kund · ${customer?.name ?? ""}`} onClose={onClose} wide>
      <CustomerForm value={form} onChange={setForm} />
      <div className="modal-actions" style={{ marginBottom: 18 }}>
        <button className="btn secondary" onClick={onClose}>Stäng</button>
        <button className="btn" disabled={save.isPending} onClick={() => save.mutate()}>Spara ändringar</button>
      </div>

      <h2>Order ({custOrders.length})</h2>
      {custOrders.length === 0 ? (
        <div className="subtle">Inga order för den här kunden.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ordernr</th><th>Prioritet</th><th>Leverans</th><th>Status</th></tr></thead>
            <tbody>
              {custOrders.map((o) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>{o.order_no}</td>
                  <td><span className={"prio " + o.priority}>{prioLabel(o.priority)}</span></td>
                  <td>{new Date(o.due_date).toLocaleDateString("sv-SE")}</td>
                  <td><span className={"badge " + o.status}>{ORDER_STATUS[o.status] ?? o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
