import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api";

const icons: Record<string, JSX.Element> = {
  dashboard: (
    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
  ),
  gantt: (
    <svg viewBox="0 0 24 24"><line x1="4" y1="6" x2="14" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="6" y1="18" x2="16" y2="18" /></svg>
  ),
  replan: (
    <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="13" y2="16" /></svg>
  ),
  customers: (
    <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6" /><path d="M17 14.3A6.5 6.5 0 0 1 21.5 20" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
  ),
};

const links = [
  { to: "/", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/gantt", label: "Planering", icon: "gantt" },
  { to: "/orders", label: "Order", icon: "orders" },
  { to: "/customers", label: "Kunder", icon: "customers" },
  { to: "/settings", label: "Inställningar", icon: "settings" },
];

export default function Layout() {
  const nav = useNavigate();
  return (
    <div className="app">
      <aside className="rail">
        <div className="logo-chip">
          <img src="/vanertekno-mark.svg" alt="Vänertekno" />
        </div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => "rail-item" + (isActive ? " active" : "")}>
            {icons[l.icon]}
            {l.label}
          </NavLink>
        ))}
        <div className="spacer" />
        <div className="rail-item rail-logout" onClick={() => { api.logout(); nav("/login"); }}>
          {icons.logout}
          Logga ut
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
