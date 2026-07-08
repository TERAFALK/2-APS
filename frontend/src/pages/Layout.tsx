import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/gantt", label: "Gantt-planering" },
  { to: "/replan", label: "Om-planering" },
  { to: "/orders", label: "Order" },
  { to: "/masterdata", label: "Grunddata" },
];

export default function Layout() {
  const nav = useNavigate();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.me });

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo-chip">
          <img src="/vanertekno.svg" alt="Vänertekno" />
        </div>
        <div className="logo-sub">APS · PRODUKTIONSPLANERING</div>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              <span className="dot" />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        {me && (
          <div className="user">
            {me.full_name || me.email}
            <br />
            <span style={{ textTransform: "capitalize" }}>{me.role}</span>
          </div>
        )}
        <button
          className="logout"
          onClick={() => {
            api.logout();
            nav("/login");
          }}
        >
          Logga ut
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
