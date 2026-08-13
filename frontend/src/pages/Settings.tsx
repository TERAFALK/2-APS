import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import Modal from "../components/Modal";
import { onErr } from "../lib";

const EMPTY_MACHINE = {
  name: "", shift_start: "07:00", shift_end: "16:00",
  lunch_start: "12:00", lunch_end: "12:30", has_lunch: true, moment_type_ids: [] as number[],
};

function Machines() {
  const qc = useQueryClient();
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const { data: types = [] } = useQuery<any[]>({ queryKey: ["momentTypes"], queryFn: api.momentTypes });
  const inval = () => qc.invalidateQueries({ queryKey: ["machines"] });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_MACHINE);
  const typeName = (id: number) => types.find((t) => t.id === id)?.name ?? "";

  const payload = () => ({
    name: form.name, shift_start: form.shift_start, shift_end: form.shift_end,
    lunch_start: form.has_lunch ? form.lunch_start : null,
    lunch_end: form.has_lunch ? form.lunch_end : null,
    moment_type_ids: form.moment_type_ids,
  });
  const save = useMutation({
    mutationFn: () => (editId ? api.updateMachine(editId, payload()) : api.createMachine(payload())),
    onSuccess: () => { inval(); setOpen(false); setEditId(null); setForm(EMPTY_MACHINE); }, onError: onErr,
  });
  const del = useMutation({ mutationFn: (id: number) => api.deleteMachine(id), onSuccess: inval, onError: onErr });

  const startNew = () => { setEditId(null); setForm(EMPTY_MACHINE); setOpen(true); };
  const startEdit = (m: any) => {
    setEditId(m.id);
    setForm({
      name: m.name, shift_start: (m.shift_start ?? "07:00").slice(0, 5), shift_end: (m.shift_end ?? "16:00").slice(0, 5),
      lunch_start: (m.lunch_start ?? "12:00").slice(0, 5), lunch_end: (m.lunch_end ?? "12:30").slice(0, 5),
      has_lunch: !!m.lunch_start, moment_type_ids: m.moment_type_ids ?? [],
    });
    setOpen(true);
  };
  const toggleType = (id: number) =>
    setForm((f) => ({ ...f, moment_type_ids: f.moment_type_ids.includes(id) ? f.moment_type_ids.filter((x) => x !== id) : [...f.moment_type_ids, id] }));

  return (
    <div className="card">
      <div className="card-head">
        <h2>Maskiner</h2>
        <button className="btn" onClick={startNew}>＋ Ny maskin</button>
      </div>
      {machines.length === 0 ? (
        <div className="subtle">Inga maskiner ännu.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Maskin</th><th>Moment</th><th>Arbetstid</th><th>Lunch</th><th style={{ width: 150 }}>Åtgärd</th></tr></thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 550 }}>{m.name}</td>
                  <td>
                    {(m.moment_type_ids ?? []).length === 0
                      ? <span className="subtle">Inga moment</span>
                      : <span className="tag-row">{m.moment_type_ids.map((id: number) => <span key={id} className="tag">{typeName(id)}</span>)}</span>}
                  </td>
                  <td>{m.shift_start?.slice(0, 5)}–{m.shift_end?.slice(0, 5)}</td>
                  <td>{m.lunch_start ? `${m.lunch_start.slice(0, 5)}–${m.lunch_end?.slice(0, 5)}` : <span className="subtle">Ingen</span>}</td>
                  <td>
                    <button className="linkbtn" onClick={() => startEdit(m)}>Ändra</button>
                    <button className="linkbtn danger" onClick={() => confirm(`Ta bort ${m.name}?`) && del.mutate(m.id)}>Ta bort</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal title={editId ? "Ändra maskin" : "Ny maskin"} onClose={() => setOpen(false)}>
          <label className="field">Maskinnamn<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CNC-1" /></label>
          <div className="form-row">
            <label className="field" style={{ flex: 1 }}>Arbetstid från<input type="time" value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} /></label>
            <label className="field" style={{ flex: 1 }}>Arbetstid till<input type="time" value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} /></label>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.has_lunch} onChange={(e) => setForm({ ...form, has_lunch: e.target.checked })} />
            Lunchrast (maskinen visas inte som tillgänglig då)
          </label>
          {form.has_lunch && (
            <div className="form-row">
              <label className="field" style={{ flex: 1 }}>Lunch från<input type="time" value={form.lunch_start} onChange={(e) => setForm({ ...form, lunch_start: e.target.value })} /></label>
              <label className="field" style={{ flex: 1 }}>Lunch till<input type="time" value={form.lunch_end} onChange={(e) => setForm({ ...form, lunch_end: e.target.value })} /></label>
            </div>
          )}
          <div className="field">
            Moment som maskinen kan utföra
            {types.length === 0 ? (
              <div className="subtle">Lägg upp momenttyper först.</div>
            ) : (
              <div className="pick-grid">
                {types.map((t) => (
                  <label key={t.id} className={"pick" + (form.moment_type_ids.includes(t.id) ? " on" : "")}>
                    <input type="checkbox" checked={form.moment_type_ids.includes(t.id)} onChange={() => toggleType(t.id)} />
                    {t.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setOpen(false)}>Avbryt</button>
            <button className="btn" disabled={!form.name || save.isPending} onClick={() => save.mutate()}>{editId ? "Spara ändringar" : "Skapa maskin"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MomentTypes() {
  const qc = useQueryClient();
  const { data: types = [] } = useQuery<any[]>({ queryKey: ["momentTypes"], queryFn: api.momentTypes });
  const inval = () => { qc.invalidateQueries({ queryKey: ["momentTypes"] }); qc.invalidateQueries({ queryKey: ["machines"] }); };
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");

  const save = useMutation({
    mutationFn: () => (editId ? api.updateMomentType(editId, { name }) : api.createMomentType({ name })),
    onSuccess: () => { inval(); setOpen(false); setEditId(null); setName(""); }, onError: onErr,
  });
  const del = useMutation({ mutationFn: (id: number) => api.deleteMomentType(id), onSuccess: inval, onError: onErr });

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Momenttyper</h2>
          <div className="subtle">Väljs när du lägger till faser på en order, t.ex. Fräsning eller Montering.</div>
        </div>
        <button className="btn" onClick={() => { setEditId(null); setName(""); setOpen(true); }}>＋ Ny momenttyp</button>
      </div>
      {types.length === 0 ? (
        <div className="subtle">Inga momenttyper ännu.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Momenttyp</th><th style={{ width: 150 }}>Åtgärd</th></tr></thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 550 }}>{t.name}</td>
                  <td>
                    <button className="linkbtn" onClick={() => { setEditId(t.id); setName(t.name); setOpen(true); }}>Ändra</button>
                    <button className="linkbtn danger" onClick={() => confirm(`Ta bort ${t.name}?`) && del.mutate(t.id)}>Ta bort</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal title={editId ? "Ändra momenttyp" : "Ny momenttyp"} onClose={() => setOpen(false)}>
          <label className="field">Namn<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Fräsning" /></label>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setOpen(false)}>Avbryt</button>
            <button className="btn" disabled={!name || save.isPending} onClick={() => save.mutate()}>{editId ? "Spara ändringar" : "Skapa momenttyp"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Settings() {
  return (
    <>
      <div className="page-head">
        <h1>Inställningar</h1>
        <span className="subtle">Maskiner, moment och arbetstider</span>
      </div>
      <div className="stack">
        <MomentTypes />
        <Machines />
      </div>
    </>
  );
}
