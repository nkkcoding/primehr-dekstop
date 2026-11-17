import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthApi, type User } from "../lib/api";

export default function LoginPage({
  onLoggedIn,
}: {
  onLoggedIn: (user: User, token: string) => void;
}) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Admin123!@#");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await AuthApi.login(username.trim(), password);
      onLoggedIn(res.user, res.token);
      navigate(res.user.mustChangePassword ? "/schimba-parola" : "/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Autentificare eșuată");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-center">
      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        <h1 className="brand">PrimeHR Documents</h1>
        <p className="brand-sub">Autentificare locală (trial host PC)</p>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label htmlFor="username">Utilizator</label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Parolă</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Se conectează…" : "Intră în aplicație"}
        </button>
        <p className="hint">
          Seed trial: <code>admin</code> / <code>Admin123!@#</code> · <code>manager1</code> /{" "}
          <code>Manager123!@#</code> — la primul login veți schimba parola.
        </p>
      </form>
    </div>
  );
}
