import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthApi, type User } from "../lib/api";

export default function ChangePasswordPage({
  user,
  onChanged,
}: {
  user: User;
  onChanged: (user: User) => void;
}) {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const force = user.mustChangePassword;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 12) {
      setError("Parola nouă trebuie să aibă cel puțin 12 caractere.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Confirmarea nu coincide cu parola nouă.");
      return;
    }
    setBusy(true);
    try {
      const res = await AuthApi.changePassword(force ? null : currentPassword, newPassword);
      onChanged(res.user);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut schimba parola");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-center">
      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        <h1 className="brand">Schimbare parolă</h1>
        <p className="brand-sub">
          {force
            ? "La primul login trebuie să setați o parolă nouă."
            : "Actualizați parola contului."}
        </p>
        {error && <div className="error">{error}</div>}
        {!force && (
          <div className="field">
            <label htmlFor="current">Parola curentă</label>
            <input
              id="current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="new">Parolă nouă (≥ 12 caractere)</label>
          <input
            id="new"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={12}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirmare</label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={12}
          />
        </div>
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Se salvează…" : "Salvează parola"}
        </button>
      </form>
    </div>
  );
}
