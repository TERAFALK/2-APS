import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

function useInval(keys: string[]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}
const err = (e: any) => alert(e?.message || "Något gick fel");

/* ---------------- Maskintyper ---------------- */
function MachineTypes() {
  const { data: types = [] } = useQuery<any[]>({ queryKey: ["machineTypes"], queryFn: api.machineTypes });
  const inval = useInval(["machineTypes", "machines"]);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: () => (editId ? api.updateMachineType(editId, { name }) : api.createMachineType({ name })),
    onSuccess: () => { inval(); setName(""); setEditId(null); },
    onError: err,
  });
  const del = useMutation({ mutationFn: (id: number) => api.deleteMachineType(id), onSuccess: inval, onError: err });

  return (
    <div className="card">
      <h2>Maskintyper</h2>
      <div className="form-row">
        <label className="field">Namn
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="t.ex. CNC-fräs" />
        </label>
        <button className="btn secondary" disabled={!name || save.isPending} onClick={() => save.mutate()}>
          {editId ? "Spara" : "Lägg till"}
        </button>
        {editId && <button className="btn secondary" onClick={() => { setEditId(null); setName(""); }}>Avbryt</button>}
      </div>
      {types.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Maskintyp</th><th style={{ width: 160 }}>Åtgärd</th></tr></thead>
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

/* ---------------- Maskiner ---------------- */
function Machines() {
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const { data: types = [] } = useQuery<any[]>({ queryKey: ["machineTypes"], queryFn: api.machineTypes });
  const inval = useInval(["machines"]);
  const empty = { name: "", machine_type_id: 0, shift_start: "07:00", shift_end: "16:00" };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const typeName = (id: number) => types.find((t) => t.id === id)?.name ?? "–";

  const body = () => ({ ...form, machine_type_id: Number(form.machine_type_id) });
  const save = useMutation({
    mutationFn: () => (editId ? api.updateMachine(editId, body()) : api.createMachine(body())),
    onSuccess: () => { inval(); setForm(empty); setEditId(null); },
    onError: err,
  });
  const del = useMutation({ mutationFn: (id: number) => api.deleteMachine(id), onSuccess: inval, onError: err });

  return (
    <div className="card">
      <h2>Maskiner</h2>
      <div className="form-row">
        <label className="field">Namn<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="t.ex. CNC-1" /></label>
        <label className="field">Maskintyp
          <select value={form.machine_type_id} onChange={(e) => setForm({ ...form, machine_type_id: Number(e.target.value) })}>
            <option value={0}>Välj…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field">Skift start<input type="time" value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} /></label>
        <label className="field">Skift slut<input type="time" value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} /></label>
        <button className="btn secondary" disabled={!form.name || !form.machine_type_id || save.isPending} onClick={() => save.mutate()}>
          {editId ? "Spara" : "Lägg till"}
        </button>
        {editId && <button className="btn secondary" onClick={() => { setEditId(null); setForm(empty); }}>Avbryt</button>}
      </div>
      {machines.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Maskin</th><th>Typ</th><th>Arbetstid</th><th style={{ width: 160 }}>Åtgärd</th></tr></thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td>{typeName(m.machine_type_id)}</td>
                  <td>{m.shift_start?.slice(0, 5)}–{m.shift_end?.slice(0, 5)}</td>
                  <td>
                    <button className="linkbtn" onClick={() => { setEditId(m.id); setForm({ name: m.name, machine_type_id: m.machine_type_id, shift_start: m.shift_start?.slice(0, 5), shift_end: m.shift_end?.slice(0, 5) }); }}>Ändra</button>
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

/* ---------------- Produkter + routing ---------------- */
function Products() {
  const { data: products = [] } = useQuery<any[]>({ queryKey: ["products"], queryFn: api.products });
  const { data: types = [] } = useQuery<any[]>({ queryKey: ["machineTypes"], queryFn: api.machineTypes });
  const inval = useInval(["products"]);
  const empty = { article_no: "", name: "", version: "1", description: "" };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: () => (editId ? api.updateProduct(editId, form) : api.createProduct(form)),
    onSuccess: () => { inval(); setForm(empty); setEditId(null); },
    onError: err,
  });
  const del = useMutation({ mutationFn: (id: number) => api.deleteProduct(id), onSuccess: inval, onError: err });

  return (
    <div className="card">
      <h2>Produkter & routing</h2>
      <div className="form-row">
        <label className="field">Artikelnr<input value={form.article_no} onChange={(e) => setForm({ ...form, article_no: e.target.value })} placeholder="ART-1001" /></label>
        <label className="field">Produktnamn<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Hydraulblock" /></label>
        <label className="field">Version<input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} style={{ width: 70 }} /></label>
        <button className="btn secondary" disabled={!form.article_no || !form.name || save.isPending} onClick={() => save.mutate()}>
          {editId ? "Spara" : "Skapa produkt"}
        </button>
        {editId && <button className="btn secondary" onClick={() => { setEditId(null); setForm(empty); }}>Avbryt</button>}
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {products.length === 0 && <span className="subtle">Inga produkter ännu.</span>}
        {products.map((p) => (
          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div><strong>{p.article_no}</strong> — {p.name} <span className="subtle">(v{p.version} · {p.routing?.length ?? 0} operationer)</span></div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="linkbtn" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>{expanded === p.id ? "Stäng" : "Routing"}</button>
                <button className="linkbtn" onClick={() => { setEditId(p.id); setForm({ article_no: p.article_no, name: p.name, version: p.version, description: p.description || "" }); }}>Ändra</button>
                <button className="linkbtn danger" onClick={() => confirm(`Ta bort ${p.article_no}?`) && del.mutate(p.id)}>Ta bort</button>
              </div>
            </div>
            {expanded === p.id && <RoutingEditor product={p} types={types} onSaved={inval} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoutingEditor({ product, types, onSaved }: { product: any; types: any[]; onSaved: () => void }) {
  const nextSeq = (product.routing?.at(-1)?.sequence ?? 0) + 1;
  const empty = { sequence: nextSeq, name: "", machine_type_id: 0, run_minutes_per_unit: 1, setup_minutes: 0 };
  const [step, setStep] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const typeName = (id: number) => types.find((t) => t.id === id)?.name ?? id;

  const body = () => ({ ...step, machine_type_id: Number(step.machine_type_id) });
  const save = useMutation({
    mutationFn: () => (editId ? api.updateRouting(product.id, editId, body()) : api.addRouting(product.id, body())),
    onSuccess: () => { onSaved(); setStep({ ...empty, sequence: nextSeq }); setEditId(null); },
    onError: err,
  });
  const del = useMutation({ mutationFn: (sid: number) => api.deleteRouting(product.id, sid), onSuccess: onSaved, onError: err });

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      {product.routing?.length > 0 && (
        <table style={{ marginBottom: 12 }}>
          <thead><tr><th>Steg</th><th>Operation</th><th>Maskintyp</th><th>Min/st</th><th>Ställtid</th><th style={{ width: 150 }}>Åtgärd</th></tr></thead>
          <tbody>
            {product.routing.map((s: any) => (
              <tr key={s.id}>
                <td>{s.sequence}</td><td>{s.name}</td><td>{typeName(s.machine_type_id)}</td>
                <td>{s.run_minutes_per_unit}</td><td>{s.setup_minutes}</td>
                <td>
                  <button className="linkbtn" onClick={() => { setEditId(s.id); setStep({ sequence: s.sequence, name: s.name, machine_type_id: s.machine_type_id, run_minutes_per_unit: s.run_minutes_per_unit, setup_minutes: s.setup_minutes }); }}>Ändra</button>
                  <button className="linkbtn danger" onClick={() => confirm(`Ta bort ${s.name}?`) && del.mutate(s.id)}>Ta bort</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="form-row">
        <label className="field">Steg<input type="number" style={{ width: 64 }} value={step.sequence} onChange={(e) => setStep({ ...step, sequence: Number(e.target.value) })} /></label>
        <label className="field">Operation<input value={step.name} onChange={(e) => setStep({ ...step, name: e.target.value })} placeholder="Fräsning" /></label>
        <label className="field">Maskintyp
          <select value={step.machine_type_id} onChange={(e) => setStep({ ...step, machine_type_id: Number(e.target.value) })}>
            <option value={0}>Välj…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field">Min/st<input type="number" style={{ width: 76 }} value={step.run_minutes_per_unit} onChange={(e) => setStep({ ...step, run_minutes_per_unit: Number(e.target.value) })} /></label>
        <label className="field">Ställtid (min)<input type="number" style={{ width: 90 }} value={step.setup_minutes} onChange={(e) => setStep({ ...step, setup_minutes: Number(e.target.value) })} /></label>
        <button className="btn secondary" disabled={!step.name || !step.machine_type_id || save.isPending} onClick={() => save.mutate()}>
          {editId ? "Spara" : "Lägg till steg"}
        </button>
        {editId && <button className="btn secondary" onClick={() => { setEditId(null); setStep({ ...empty, sequence: nextSeq }); }}>Avbryt</button>}
      </div>
    </div>
  );
}

export default function MasterData() {
  return (
    <>
      <div className="page-head">
        <h1>Grunddata</h1>
        <span className="subtle">Lägg upp, ändra och ta bort maskiner och produkter</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <MachineTypes />
        <Machines />
        <Products />
      </div>
    </>
  );
}
