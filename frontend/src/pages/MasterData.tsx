import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

function useInval(keys: string[]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}
const onErr = (e: any) => alert(e?.message || "Något gick fel");

/* ---------------- Kunder ---------------- */
function Customers() {
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["customers"], queryFn: api.customers });
  const inval = useInval(["customers"]);
  const empty = { name: "", contact_email: "", contact_phone: "" };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: () => (editId ? api.updateCustomer(editId, form) : api.createCustomer(form)),
    onSuccess: () => { inval(); setForm(empty); setEditId(null); }, onError: onErr,
  });
  const del = useMutation({ mutationFn: (id: number) => api.deleteCustomer(id), onSuccess: inval, onError: onErr });

  return (
    <div className="card">
      <h2>Kunder</h2>
      <div className="form-row">
        <label className="field">Namn<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Volvo CE" /></label>
        <label className="field">E-post<input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></label>
        <label className="field">Telefon<input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></label>
        <button className="btn secondary" disabled={!form.name || save.isPending} onClick={() => save.mutate()}>{editId ? "Spara" : "Lägg till"}</button>
        {editId && <button className="btn secondary" onClick={() => { setEditId(null); setForm(empty); }}>Avbryt</button>}
      </div>
      {customers.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Kund</th><th>Kontakt</th><th style={{ width: 150 }}>Åtgärd</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.contact_email}{c.contact_phone ? ` · ${c.contact_phone}` : ""}</td>
                  <td>
                    <button className="linkbtn" onClick={() => { setEditId(c.id); setForm({ name: c.name, contact_email: c.contact_email, contact_phone: c.contact_phone }); }}>Ändra</button>
                    <button className="linkbtn danger" onClick={() => confirm(`Ta bort ${c.name}?`) && del.mutate(c.id)}>Ta bort</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Maskiner ---------------- */
function Machines() {
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const inval = useInval(["machines"]);
  const empty = { name: "", shift_start: "07:00", shift_end: "16:00" };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: () => (editId ? api.updateMachine(editId, form) : api.createMachine(form)),
    onSuccess: () => { inval(); setForm(empty); setEditId(null); }, onError: onErr,
  });
  const del = useMutation({ mutationFn: (id: number) => api.deleteMachine(id), onSuccess: inval, onError: onErr });

  return (
    <div className="card">
      <h2>Maskiner</h2>
      <div className="form-row">
        <label className="field">Namn<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CNC-1" /></label>
        <label className="field">Skift start<input type="time" value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} /></label>
        <label className="field">Skift slut<input type="time" value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} /></label>
        <button className="btn secondary" disabled={!form.name || save.isPending} onClick={() => save.mutate()}>{editId ? "Spara" : "Lägg till"}</button>
        {editId && <button className="btn secondary" onClick={() => { setEditId(null); setForm(empty); }}>Avbryt</button>}
      </div>
      {machines.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Maskin</th><th>Arbetstid</th><th style={{ width: 150 }}>Åtgärd</th></tr></thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td>{m.shift_start?.slice(0, 5)}–{m.shift_end?.slice(0, 5)}</td>
                  <td>
                    <button className="linkbtn" onClick={() => { setEditId(m.id); setForm({ name: m.name, shift_start: m.shift_start?.slice(0, 5), shift_end: m.shift_end?.slice(0, 5) }); }}>Ändra</button>
                    <button className="linkbtn danger" onClick={() => confirm(`Ta bort ${m.name}?`) && del.mutate(m.id)}>Ta bort</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Momenttyper (dropdown för faser) ---------------- */
function MomentTypes() {
  const { data: types = [] } = useQuery<any[]>({ queryKey: ["momentTypes"], queryFn: api.momentTypes });
  const inval = useInval(["momentTypes"]);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: () => (editId ? api.updateMomentType(editId, { name }) : api.createMomentType({ name })),
    onSuccess: () => { inval(); setName(""); setEditId(null); }, onError: onErr,
  });
  const del = useMutation({ mutationFn: (id: number) => api.deleteMomentType(id), onSuccess: inval, onError: onErr });

  return (
    <div className="card">
      <h2>Momenttyper</h2>
      <div className="subtle" style={{ marginBottom: 10 }}>Dessa moment väljs i en dropdown när du lägger till faser på en order (t.ex. Fräsning, Svarvning, Montering).</div>
      <div className="form-row">
        <label className="field">Namn<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fräsning" /></label>
        <button className="btn secondary" disabled={!name || save.isPending} onClick={() => save.mutate()}>{editId ? "Spara" : "Lägg till"}</button>
        {editId && <button className="btn secondary" onClick={() => { setEditId(null); setName(""); }}>Avbryt</button>}
      </div>
      {types.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Momenttyp</th><th style={{ width: 150 }}>Åtgärd</th></tr></thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    <button className="linkbtn" onClick={() => { setEditId(t.id); setName(t.name); }}>Ändra</button>
                    <button className="linkbtn danger" onClick={() => confirm(`Ta bort ${t.name}?`) && del.mutate(t.id)}>Ta bort</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function MasterData() {
  return (
    <>
      <div className="page-head">
        <h1>Grunddata</h1>
        <span className="subtle">Kunder, maskiner och momenttyper</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Customers />
        <Machines />
        <MomentTypes />
      </div>
    </>
  );
}
