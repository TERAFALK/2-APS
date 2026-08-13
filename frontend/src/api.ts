const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

const token = () => localStorage.getItem("aps_token");

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as any) };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) { localStorage.removeItem("aps_token"); window.location.href = "/login"; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}
const body = (b: any) => JSON.stringify(b);

export const api = {
  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }),
    });
    if (!res.ok) throw new Error("Fel e-post eller lösenord");
    const data = await res.json();
    localStorage.setItem("aps_token", data.access_token);
    return data;
  },
  logout: () => localStorage.removeItem("aps_token"),
  me: () => request<any>("/auth/me"),

  // dashboard
  kpi: () => request<any>("/dashboard/kpi"),
  load: () => request<any[]>("/dashboard/load"),

  // customers
  customers: () => request<any[]>("/customers"),
  createCustomer: (b: any) => request<any>("/customers", { method: "POST", body: body(b) }),
  updateCustomer: (id: number, b: any) => request<any>(`/customers/${id}`, { method: "PUT", body: body(b) }),
  deleteCustomer: (id: number) => request<void>(`/customers/${id}`, { method: "DELETE" }),

  // machines
  machines: () => request<any[]>("/machines"),
  createMachine: (b: any) => request<any>("/machines", { method: "POST", body: body(b) }),
  updateMachine: (id: number, b: any) => request<any>(`/machines/${id}`, { method: "PUT", body: body(b) }),
  deleteMachine: (id: number) => request<void>(`/machines/${id}`, { method: "DELETE" }),

  // moment types (dropdown för faser)
  momentTypes: () => request<any[]>("/moment-types"),
  createMomentType: (b: any) => request<any>("/moment-types", { method: "POST", body: body(b) }),
  updateMomentType: (id: number, b: any) => request<any>(`/moment-types/${id}`, { method: "PUT", body: body(b) }),
  deleteMomentType: (id: number) => request<void>(`/moment-types/${id}`, { method: "DELETE" }),

  // orders
  orders: () => request<any[]>("/orders"),
  createOrder: (b: any) => request<any>("/orders", { method: "POST", body: body(b) }),
  deleteOrder: (id: number) => request<void>(`/orders/${id}`, { method: "DELETE" }),
  setChainLock: (id: number, value: boolean) => request<any>(`/orders/${id}/chain-lock?value=${value}`, { method: "PATCH" }),

  // faser (moment)
  operations: () => request<any[]>("/operations"),
  addPhase: (orderId: number, b: any) => request<any>(`/orders/${orderId}/phases`, { method: "POST", body: body(b) }),
  updatePhase: (id: number, b: any) => request<any>(`/operations/${id}`, { method: "PUT", body: body(b) }),
  deletePhase: (id: number) => request<void>(`/operations/${id}`, { method: "DELETE" }),
  setPhaseStatus: (id: number, status: string) => request<any>(`/operations/${id}/status?status=${status}`, { method: "PATCH" }),
  setOvertime: (id: number, value: boolean) => request<any>(`/operations/${id}/overtime?value=${value}`, { method: "PATCH" }),
  resizePhase: (id: number, hours: number, startIso?: string) => {
    const p = new URLSearchParams({ hours: String(hours) });
    if (startIso) p.set("start", startIso);
    return request<any>(`/operations/${id}/resize?${p}`, { method: "POST" });
  },

  // manuell schemaläggning
  placePart: (id: number, startIso: string, machineId: number | null, hours: number) => {
    const p = new URLSearchParams({ start: startIso, hours: String(hours) });
    if (machineId != null) p.set("machine_id", String(machineId));
    return request<any>(`/operations/${id}/place-part?${p}`, { method: "POST" });
  },
  scheduleManual: (id: number, startIso: string, machineId: number | null) => {
    const p = new URLSearchParams({ start: startIso });
    if (machineId != null) p.set("machine_id", String(machineId));
    return request<any>(`/operations/${id}/manual?${p}`, { method: "PATCH" });
  },
  unscheduleMoment: (id: number) => request<any>(`/operations/${id}/manual?unschedule=true`, { method: "PATCH" }),
};

export const isLoggedIn = () => !!token();
