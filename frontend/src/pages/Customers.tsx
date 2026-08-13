import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Modal from "../components/Modal";
import { onErr } from "../lib";

const EMPTY = { name: "", customer_no: "", org_no: "", contact_email: "", contact_phone: "", address: "", notes: "" };

export default function Customers() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["customers"], queryFn: api.customers });
  const [showNew, setShowNew] = useState(false);
  const [q, setQ] = useState("");
  const [c, setC] = useState(EMPTY);
  const f = (k: string) => (e: any) => setC({ ...c, [k]: e.target.value });
  const term = q.trim().toLowerCase();
  const shown = term
    ? customers.filter((cu) => [cu.name, cu.customer_no, cu.org_no, cu.contact_email, cu.contact_phone]
        .filter(Boolean).join(" ").toLowerCase().includes(term))
    : customers;

  const create = useMutation({
    mutationFn: () => api.createCustomer(c),
    onSuccess: (created: any) => { qc.invalidateQueries({ queryKey: ["customers"] }); setShowNew(false); setC(EMPTY); if (created?.id) nav(`/customers/${created.id}`); },
    onError: onErr,
  });

  return (
    <>
      <div className="page-head">
        <h1>Kunder</h1>
        <button className="btn" onClick={() => setShowNew(true)}>＋ Ny kund</button>
      </div>

      {customers.length > 0 && (
        <div className="searchbar">
          <span className="search-icon">🔍</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök kund, kundnummer, org.nr eller kontakt…" />
          {q && <button className="linkbtn" onClick={() => setQ("")}>Rensa</button>}
        </div>
      )}

      {customers.length === 0 ? (
        <div className="empty"><div className="icon">👥</div><h3>Inga kunder ännu</h3><div>Lägg till din första kund uppe till höger.</div></div>
      ) : shown.length === 0 ? (
        <div className="empty"><div className="icon">🔍</div><h3>Inga träffar</h3><div>Ingen kund matchar ”{q}”.</div></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kund</th><th>Kundnr</th><th>Org.nr</th><th>Kontakt</th></tr></thead>
            <tbody>
              {shown.map((cu) => (
                <tr key={cu.id} style={{ cursor: "pointer" }} onClick={() => nav(`/customers/${cu.id}`)}>
                  <td style={{ fontWeight: 550 }}>{cu.name}</td>
                  <td>{cu.customer_no || "–"}</td>
                  <td>{cu.org_no || "–"}</td>
                  <td>{cu.contact_email}{cu.contact_phone ? ` · ${cu.contact_phone}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <Modal title="Ny kund" onClose={() => setShowNew(false)}>
          <label className="field">Kundnamn<input value={c.name} onChange={f("name")} /></label>
          <div className="form-row">
            <label className="field" style={{ flex: 1 }}>Kundnummer<input value={c.customer_no} onChange={f("customer_no")} /></label>
            <label className="field" style={{ flex: 1 }}>Organisationsnummer<input value={c.org_no} onChange={f("org_no")} /></label>
          </div>
          <div className="form-row">
            <label className="field" style={{ flex: 1 }}>E-post<input value={c.contact_email} onChange={f("contact_email")} /></label>
            <label className="field" style={{ flex: 1 }}>Telefon<input value={c.contact_phone} onChange={f("contact_phone")} /></label>
          </div>
          <label className="field">Adress<input value={c.address} onChange={f("address")} /></label>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setShowNew(false)}>Avbryt</button>
            <button className="btn" disabled={!c.name || create.isPending} onClick={() => create.mutate()}>Skapa kund</button>
          </div>
        </Modal>
      )}
    </>
  );
}
