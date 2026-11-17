import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CasesApi,
  getWsUrl,
  type CaseFile,
  type CaseItem,
  type User,
} from "../lib/api";

const STATUSES = ["Nou", "În lucru", "Rezolvat", "Închis"];

export default function CasesPage({ user }: { user: User }) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [files, setFiles] = useState<CaseFile[]>([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Nou");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await CasesApi.list();
    setCases(res.cases);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await CasesApi.get(id);
    setSelectedId(res.case.id);
    setFiles(res.files);
  }, []);

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : "Eroare listă"));
  }, [refresh]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      ws = new WebSocket(getWsUrl());
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { event?: string };
          if (msg.event === "cases:changed") {
            setFlash("Actualizare de la host — lista se reîncarcă");
            void refresh();
            if (selectedId) void loadDetail(selectedId);
            setTimeout(() => setFlash(null), 2500);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) setTimeout(connect, 2000);
      };
    }
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [refresh, loadDetail, selectedId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await CasesApi.create(title.trim(), status);
      setTitle("");
      setStatus("Nou");
      await refresh();
      await loadDetail(res.case.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creare eșuată");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(fileList: FileList | null) {
    if (!selectedId || !fileList?.[0]) return;
    setBusy(true);
    setError(null);
    try {
      await CasesApi.upload(selectedId, fileList[0]);
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload eșuat");
    } finally {
      setBusy(false);
    }
  }

  const canCreate = user.role !== "IGM";

  return (
    <div className="page">
      <h1>Cazuri</h1>
      <p className="lead">
        Felia verticală: creare / listare caz + upload PDF/PNG pe host, cu sync live pe clienți.
      </p>
      {error && <div className="error">{error}</div>}
      {flash && (
        <div className="card-plain" style={{ borderColor: "#86efac", background: "#f0fdf4" }}>
          {flash}
        </div>
      )}

      {canCreate && (
        <form className="card-plain" onSubmit={(e) => void onCreate(e)}>
          <strong>Caz nou</strong>
          <div className="btn-row" style={{ marginTop: 12, alignItems: "end" }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="title">Titlu</label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Ex. Solicitare permis — Firma X"
              />
            </div>
            <div className="field" style={{ width: 160, marginBottom: 0 }}>
              <label htmlFor="status">Status</label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Creează
            </button>
          </div>
        </form>
      )}

      <div className="card-plain">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Titlu</th>
              <th>Status</th>
              <th>Actualizat</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 ? (
              <tr>
                <td colSpan={4}>Niciun caz încă.</td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr
                  key={c.id}
                  style={{
                    cursor: "pointer",
                    background: selectedId === c.id ? "var(--steel-100)" : undefined,
                  }}
                  onClick={() => void loadDetail(c.id)}
                >
                  <td>
                    <strong>{c.id}</strong>
                  </td>
                  <td>{c.title}</td>
                  <td>
                    <span className="badge">{c.status}</span>
                  </td>
                  <td>{c.updated_at}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <div className="card-plain">
          <strong>Fișiere — {selectedId}</strong>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <label className="btn" style={{ display: "inline-block" }}>
              Încarcă PDF/PNG
              <input
                type="file"
                accept=".pdf,.png,application/pdf,image/png"
                hidden
                onChange={(e) => void onUpload(e.target.files)}
              />
            </label>
          </div>
          <ul>
            {files.length === 0 && <li>Niciun fișier.</li>}
            {files.map((f) => (
              <li key={f.id}>
                <a href={CasesApi.downloadUrl(f.id)} target="_blank" rel="noreferrer">
                  {f.original_name}
                </a>{" "}
                <span className="hint">
                  ({Math.round(f.size_bytes / 1024)} KB · {f.created_at})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
