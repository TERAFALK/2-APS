import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { onErr } from "../lib";

function useInval(keys: string[]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

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
      <div className="subtle" style={{ marginBottom: 10 }}>Väljs i dropdown när du lägger till faser på en order (t.ex. Fräsning, Svarvning, Montering).</div>
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

export default function Settings() {
  return (
    <>
      <div className="page-head"><h1>Inställningar</h1><span className="subtle">Maskiner och momenttyper</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Machines />
        <MomentTypes />
      </div>
    </>
  );
}
