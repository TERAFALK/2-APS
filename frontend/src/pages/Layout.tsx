import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Layout() {
  const nav = useNavigate();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          VÄNER<span>TEKNO</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/gantt">Gantt-planering</NavLink>
          <NavLink to="/orders">Order</NavLink>
        </nav>
        <div className="spacer" />
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
