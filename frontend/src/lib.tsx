export const PRIORITIES = [
  { value: "low", label: "Låg" },
  { value: "medium", label: "Mellan" },
  { value: "high", label: "Hög" },
  { value: "urgent", label: "Akut" },
];
export const prioLabel = (v: string) => PRIORITIES.find((p) => p.value === v)?.label ?? v;

export const ORDER_STATUS: Record<string, string> = {
  draft: "Utkast", released: "Frisläppt", scheduled: "Schemalagd",
  in_progress: "Pågår", done: "Klar", cancelled: "Avbruten",
};

export const PHASE_STATUS: Record<string, string> = {
  planned: "Planerad", running: "Pågår", done: "Klar", delayed: "Försenad", locked: "Låst",
};

export const onErr = (e: any) => alert(e?.message || "Något gick fel");
