import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

type Op = {
  id: number;
  name: string;
  machine_id: number | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
};

export default function Gantt() {
  const qc = useQueryClient();
  const { data: ops = [] } = useQuery<Op[]>({ queryKey: ["operations"], queryFn: api.operations });
  const { data: machines = [] } = useQuery<any[]>({ queryKey: ["machines"], queryFn: api.machines });

  const run = useMutation({
    mutationFn: api.runPlan,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operations"] }),
  });
  const lock = useMutation({
    mutationFn: (id: number) => api.lockOperation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operations"] }),
  });

  const { min, max } = useMemo(() => {
    const times = ops
      .filter((o) => o.start_time && o.end_time)
      .flatMap((o) => [new Date(o.start_time!).getTime(), new Date(o.end_time!).getTime()]);
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [ops]);

  const span = max - min || 1;
  const machineName = (id: number | null) =>
    machines.find((m) => m.id === id)?.name ?? "Otilldelad";

  const byMachine: Record<string, Op[]> = {};
  for (const o of ops) {
    const key = machineName(o.machine_id);
    (byMachine[key] ??= []).push(o);
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Gantt-planering</h1>
        <button className="btn" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Planerar…" : "Kör planering"}
        </button>
      </div>

      {ops.length === 0 && <p>Inga schemalagda operationer. Skapa order och kör planering.</p>}

      <div className="gantt">
        {Object.entries(byMachine).map(([machine, rows]) => (
          <div key={machine} className="gantt-row">
            <div className="gantt-label">{machine}</div>
            <div className="gantt-track">
              {rows.map((o) => {
                if (!o.start_time || !o.end_time) return null;
                const s = new Date(o.start_time).getTime();
                const e = new Date(o.end_time).getTime();
                const left = ((s - min) / span) * 100;
                const width = ((e - s) / span) * 100;
                return (
                  <div
                    key={o.id}
                    className={"gantt-bar" + (o.status === "locked" ? " locked" : "")}
                    style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
                    title={`${o.name} — dubbelklick för att låsa`}
                    onDoubleClick={() => lock.mutate(o.id)}
                  >
                    {o.name}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Dubbelklicka på en operation för att låsa dess position inför nästa planering.
      </p>
    </>
  );
}
