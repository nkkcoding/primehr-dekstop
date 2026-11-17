import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { probeHost, saveConnectionConfig } from "../lib/api";
import type { ConnectionConfig, PrimeHrMode } from "../vite-env";

export default function ModeSelectPage({
  initial,
  onSaved,
}: {
  initial: ConnectionConfig | null;
  onSaved: (cfg: ConnectionConfig) => void;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<PrimeHrMode>(initial?.mode || "host");
  const [hostUrl, setHostUrl] = useState(initial?.hostUrl || "http://192.168.1.10:3847");
  const [ips, setIps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (window.primehr?.getLocalIpHint) {
        setIps(await window.primehr.getLocalIpHint());
      }
    })();
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const next: ConnectionConfig = {
        mode,
        hostUrl: mode === "host" ? "http://127.0.0.1:3847" : hostUrl.trim().replace(/\/$/, ""),
      };
      if (mode === "client") {
        const ok = await probeHost(next.hostUrl);
        if (!ok) {
          setError(
            "Nu pot contacta host-ul. Verificați IP/port, firewall și că aplicația rulează în modul Host pe PC-ul principal.",
          );
          setBusy(false);
          return;
        }
      }
      const saved = await saveConnectionConfig(next);
      onSaved(saved);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvare eșuată");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-center">
      <div className="panel" style={{ width: "min(520px, 100%)" }}>
        <h1 className="brand">PrimeHR Documents</h1>
        <p className="brand-sub">Alegeți modul de conectare pe rețeaua locală</p>
        {error && <div className="error">{error}</div>}

        <div className="mode-cards">
          <button
            type="button"
            className={`mode-card ${mode === "host" ? "active" : ""}`}
            onClick={() => setMode("host")}
          >
            <strong>Host (PC principal)</strong>
            <span>
              Pornește API + SQLite + folder uploads pe acest calculator. Clienții din LAN se
              conectează aici.
            </span>
          </button>
          <button
            type="button"
            className={`mode-card ${mode === "client" ? "active" : ""}`}
            onClick={() => setMode("client")}
          >
            <strong>Client (alt PC din birou)</strong>
            <span>Se leagă la host prin IP:port. Nu ține baza de date locală.</span>
          </button>
        </div>

        {mode === "host" ? (
          <p className="hint">
            Port implicit: <strong>3847</strong>.
            {ips.length > 0 && (
              <>
                {" "}
                IP-uri locale detectate: {ips.map((ip) => `${ip}:3847`).join(", ")}.
              </>
            )}
          </p>
        ) : (
          <div className="field">
            <label htmlFor="hostUrl">URL host (ex. http://192.168.1.10:3847)</label>
            <input
              id="hostUrl"
              value={hostUrl}
              onChange={(e) => setHostUrl(e.target.value)}
              placeholder="http://192.168.1.10:3847"
            />
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="btn" disabled={busy} onClick={() => void submit()}>
            {busy ? "Se verifică…" : "Continuă"}
          </button>
        </div>
      </div>
    </div>
  );
}
