import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@vanertekno.se");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api.login(email, password);
      nav("/");
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <img src="/vanertekno.svg" alt="Vänertekno" style={{ width: 200, marginBottom: 6 }} />
        <div className="tag">Produktionsplanering · APS</div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-post" />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Lösenord"
        />
        {err && <div className="err">{err}</div>}
        <button className="btn" style={{ width: "100%", marginTop: 10 }}>
          Logga in
        </button>
      </form>
    </div>
  );
}
