import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

function useInvalidate(keys: string[]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

/* ---------------- Maskintyper ---------------- */
function MachineTypes() {
  const { data: types = [] } = useQuery<any[]>({ queryKey: ["machineTypes"], queryFn: api.machineTypes });
  const [name, setName] = useState("");
  const inval = useInvalidate(["machineTypes"]);
  const create = useMutation({
    mutationFn: () => api.createMachineType({ name }),
    onSuccess: () => { inval(); setName(""); },
  });
  return (
    <div className="card">
      <h2>Maskintyper</h2>
      <div className="form-row">
        <label className="field">
          Namn
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="t.ex. CNC-fräs" />
        </label>
        <button className="btn secondary" disabled={!name || create.isPending} onClick={() => create.mutate()}>
          Lägg till
        </button>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {types.map((t) => (
          <span key={t.id} className="badge scheduled">{t.name}</span>
        ))}
        {types.length === 0 && <span className="subtle">Inga maskintyper ännu.</span>}
      </div>
    </div>
  );
}

/* ---------------- Maskiner ---------------- */
function Machines() {
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });
  const { data: types = [] } = useQuery<any[]>({ queryKey: ["machineTypes"], queryFn: api.machineTypes });
  const inval = useInvalidate(["machines"]);
  const empty = { name: "", machine_type_id: 0, shift_start: "07:00", shift_end: "16:00" };
  const [form, setForm] = useState(empty);
  const typeName = (id: number) => types.find((t) => t.id === id)?.name ?? "–";
  const create = useMutation({
    mutationFn: () => api.createMachine({ ...form, machine_type_id: Number(form.machine_type_id) }),
    onSuccess: () => { inval(); setForm(empty); },
  });
  return (
    <div className="card">
      <h2>Maskiner</h2>
      <div className="form-row">
        <label className="field">
          Namn
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="t.ex. CNC-1" />
        </label>
        <label className="field">
          Maskintyp
          <select value={form.machine_type_id} onChange={(e) => setForm({ ...form, machine_type_id: Number(e.target.value) })}>
            <option value={0}>Välj…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field">
          Skift start
          <input type="time" value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} />
        </label>
        <label className="field">
          Skift slut
          <input type="time" value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} />
        </label>
        <button className="btn secondary" disabled={!form.name || !form.machine_type_id || create.isPending} onClick={() => create.mutate()}>
          Lägg till
        </button>
      </div>
      {machines.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Maskin</th><th>Typ</th><th>Arbetstid</th></tr></thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td>{typeName(m.machine_type_id)}</td>
                  <td>{m.shift_start?.slice(0, 5)}–{m.shift_end?.slice(0, 5)}</td>
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
  const inval = useInvalidate(["products"]);
  const [prod, setProd] = useState({ article_no: "", name: "" });
  const [expanded, setExpanded] = useState<number | null>(null);

  const createProd = useMutation({
    mutationFn: () => api.createProduct(prod),
    onSuccess: () => { inval(); setProd({ article_no: "", name: "" }); },
  });

  return (
    <div className="card">
      <h2>Produkter & routing</h2>
      <div className="form-row">
        <label className="field">
          Artikelnr
          <input value={prod.article_no} onChange={(e) => setProd({ ...prod, article_no: e.target.value })} placeholder="ART-1001" />
        </label>
        <label className="field">
          Produktnamn
          <input value={prod.name} onChange={(e) => setProd({ ...prod, name: e.target.value })} placeholder="Hydraulblock" />
        </label>
        <button className="btn secondary" disabled={!prod.article_no || !prod.name || createProd.isPending} onClick={() => createProd.mutate()}>
          Skapa produkt
        </button>
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {products.length === 0 && <span className="subtle">Inga produkter ännu.</span>}
        {products.map((p) => (
          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{p.article_no}</strong> — {p.name}{" "}
                <span className="subtle">({p.routing?.length ?? 0} operationer)</span>
              </div>
              <button className="btn secondary" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                {expanded === p.id ? "Stäng" : "Routing"}
              </button>
            </div>
            {expanded === p.id && <RoutingEditor product={p} types={types} onSaved={inval} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoutingEditor({ product, types, onSaved }: { product: any; types: any[]; onSaved: () => void }) {
  const nextSeq = ((product.routing?.at(-1)?.sequence ?? 0) + 10) || 10;
  const empty = { sequence: nextSeq, name: "", machine_type_id: 0, run_minutes_per_unit: 1, setup_minutes: 0 };
  const [step, setStep] = useState(empty);
  const add = useMutation({
    mutationFn: () => api.addRouting(product.id, { ...step, machine_type_id: Number(step.machine_type_id) }),
    onSuccess: () => { onSaved(); setStep({ ...empty, sequence: step.sequence + 10 }); },
  });
  const typeName = (id: number) => types.find((t) => t.id === id)?.name ?? id;

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      {product.routing?.length > 0 && (
        <table style={{ marginBottom: 12 }}>
          <thead><tr><th>Seq</th><th>Operation</th><th>Maskintyp</th><th>Min/st</th><th>Ställtid</th></tr></thead>
          <tbody>
            {product.routing.map((s: any) => (
              <tr key={s.id}>
                <td>{s.sequence}</td><td>{s.name}</td><td>{typeName(s.machine_type_id)}</td>
                <td>{s.run_minutes_per_unit}</td><td>{s.setup_minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="form-row">
        <label className="field">Seq<input type="number" style={{ width: 70 }} value={step.sequence} onChange={(e) => setStep({ ...step, sequence: Number(e.target.value) })} /></label>
        <label className="field">Operation<input value={step.name} onChange={(e) => setStep({ ...step, name: e.target.value })} placeholder="Fräsning" /></label>
        <label className="field">Maskintyp
          <select value={step.machine_type_id} onChange={(e) => setStep({ ...step, machine_type_id: Number(e.target.value) })}>
            <option value={0}>Välj…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field">Min/st<input type="number" style={{ width: 80 }} value={step.run_minutes_per_unit} onChange={(e) => setStep({ ...step, run_minutes_per_unit: Number(e.target.value) })} /></label>
        <label className="field">Ställtid (min)<input type="number" style={{ width: 90 }} value={step.setup_minutes} onChange={(e) => setStep({ ...step, setup_minutes: Number(e.target.value) })} /></label>
        <button className="btn secondary" disabled={!step.name || !step.machine_type_id || add.isPending} onClick={() => add.mutate()}>
          Lägg till steg
        </button>
      </div>
    </div>
  );
}

export default function MasterData() {
  return (
    <>
      <div className="page-head">
        <h1>Grunddata</h1>
        <span className="subtle">Lägg upp maskiner och produkter innan du planerar</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <MachineTypes />
        <Machines />
        <Products />
      </div>
    </>
  );
}
