const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

function token(): string | null {
  return localStorage.getItem("aps_token");
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) {
    localStorage.removeItem("aps_token");
    window.location.href = "/login";
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  async login(email: string, password: string) {
    const body = new URLSearchParams({ username: email, password });
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error("Fel e-post eller lösenord");
    const data = await res.json();
    localStorage.setItem("aps_token", data.access_token);
    return data;
  },
  logout() {
    localStorage.removeItem("aps_token");
  },
  me: () => request<any>("/auth/me"),
  kpi: () => request<any>("/dashboard/kpi"),
  utilization: () => request<any[]>("/dashboard/utilization"),
  bottlenecks: () => request<any[]>("/dashboard/bottlenecks"),
  orders: () => request<any[]>("/orders"),
  operations: () => request<any[]>("/operations"),
  machines: () => request<any[]>("/machines"),
  machineTypes: () => request<any[]>("/machine-types"),
  products: () => request<any[]>("/products"),
  runPlan: () => request<any>("/plan/run", { method: "POST" }),
  planDiff: () => request<any>("/plan/diff"),
  lockOperation: (id: number) =>
    request<any>(`/operations/${id}/lock`, { method: "POST" }),
  createOrder: (body: any) =>
    request<any>("/orders", { method: "POST", body: JSON.stringify(body) }),
  createProduct: (body: any) =>
    request<any>("/products", { method: "POST", body: JSON.stringify(body) }),
  createMachine: (body: any) =>
    request<any>("/machines", { method: "POST", body: JSON.stringify(body) }),
  createMachineType: (body: any) =>
    request<any>("/machine-types", { method: "POST", body: JSON.stringify(body) }),
  addRouting: (productId: number, body: any) =>
    request<any>(`/products/${productId}/routing`, { method: "POST", body: JSON.stringify(body) }),
};

export const isLoggedIn = () => !!token();
