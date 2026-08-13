import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ORDER_STATUS, prioLabel, onErr } from "../lib";

export default function CustomerDetail() {
  const { id } = useParams();
  const cid = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["customers"], queryFn: api.customers });
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["orders"], queryFn: api.orders });
  const customer = customers.find((c) => c.id === cid);

  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (customer && !form) setForm(customer); }, [customer]); // eslint-disable-line

  const save = useMutation({ mutationFn: () => api.updateCustomer(cid, form), onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }), onError: onErr });
  const del = useMutation({ mutationFn: () => api.deleteCustomer(cid), onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); nav("/customers"); }, onError: onErr });

  if (!form) return <div className="subtle">Laddar…</div>;
  const f = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const custOrders = orders.filter((o) => o.customer_id === cid);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb" onClick={() => nav("/customers")}>← Kunder</div>
          <h1>{customer?.name}</h1>
        </div>
        <div>
          <button className="btn" disabled={save.isPending} onClick={() => save.mutate()}>Spara</button>
          <button className="linkbtn danger" onClick={() => confirm("Ta bort kunden?") && del.mutate()}>Ta bort kund</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Kunduppgifter</h2>
        <div className="form-row">
          <label className="field" style={{ flex: 2 }}>Kundnamn<input value={form.name} onChange={f("name")} /></label>
          <label className="field" style={{ flex: 1 }}>Kundnummer<input value={form.customer_no} onChange={f("customer_no")} /></label>
          <label className="field" style={{ flex: 1 }}>Organisationsnummer<input value={form.org_no} onChange={f("org_no")} /></label>
        </div>
        <div className="form-row">
          <label className="field" style={{ flex: 1 }}>E-post<input value={form.contact_email} onChange={f("contact_email")} /></label>
          <label className="field" style={{ flex: 1 }}>Telefon<input value={form.contact_phone} onChange={f("contact_phone")} /></label>
          <label className="field" style={{ flex: 2 }}>Adress<input value={form.address} onChange={f("address")} /></label>
        </div>
        <label className="field">Anteckningar<textarea rows={3} value={form.notes} onChange={f("notes")} /></label>
      </div>

      <div className="section">
        <h2>Order ({custOrders.length})</h2>
        {custOrders.length === 0 ? (
          <div className="subtle">Inga order för den här kunden.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ordernr</th><th>Prioritet</th><th>Leverans</th><th>Status</th></tr></thead>
              <tbody>
                {custOrders.map((o) => (
                  <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => nav(`/orders/${o.id}`)}>
                    <td style={{ fontWeight: 550 }}>{o.order_no}</td>
                    <td><span className={"prio " + o.priority}>{prioLabel(o.priority)}</span></td>
                    <td>{new Date(o.due_date).toLocaleDateString("sv-SE")}</td>
                    <td><span className={"badge " + o.status}>{ORDER_STATUS[o.status] ?? o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
