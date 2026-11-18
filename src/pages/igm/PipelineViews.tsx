import { useEffect, useRef, useState, type RefObject } from "react";
import type { IgmData } from "../../lib/igmApi";
import { IgmApi } from "../../lib/igmApi";
import { active, activeCompanies, cn, companyName, fmt, today } from "./igmHelpers";
import {
  PIPELINE_STEPS,
  advanceChecklist,
  canAdvance,
  candidateDocs,
  companyStats,
  defaultDocTypeForStep,
  doneItems,
  inferPipelineStep,
  nextItems,
  previousStep,
  stepDeadlineDays,
  stepIndex,
  stepStatusLabel,
  type PipelineStep,
} from "./pipeline";
import type { IgmAuditEntry } from "../../lib/igmApi";

const PICKUP_QUICK_TYPES = [
  "Invitatii",
  "Decizii",
  "Permise de sedere",
  "Pasapoarte",
  "Caziere",
] as const;

type OpenModal = (kind: "company" | "companyEdit" | "candidate" | "archive", id?: string) => void;

const UPLOAD_DOC_TYPES = [
  "Contract",
  "Pasaport Nepal",
  "Invitatie",
  "Decizie",
  "Permis de sedere",
  "Cazier",
  "Alt document",
] as const;

const CORE_DOC_STATUS = [
  "Contract",
  "Invitatie",
  "Decizie",
  "Permis de sedere",
  "Cazier",
  "Pasaport Nepal",
] as const;

export function PipelineCompaniesView({
  data,
  filter,
  setFilter,
  openModal,
  onOpenCompany,
  onDeleteCompany,
}: {
  data: IgmData;
  filter: string;
  setFilter: (v: string) => void;
  openModal: OpenModal;
  onOpenCompany: (id: string) => void;
  onDeleteCompany: (id: string) => void;
}) {
  const q = filter.trim().toLocaleLowerCase();
  const rows = activeCompanies(data).filter((c) => !q || c.name.toLocaleLowerCase().includes(q));

  return (
    <div className="pipe-view">
      <div className="igm-toolbar">
        <button type="button" className="btn" onClick={() => openModal("company")}>
          ＋ Adaugă companie
        </button>
        <input
          className="igm-input narrow"
          placeholder="Caută companie…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="card-plain pipe-table-card">
        <table className="table pipe-table">
          <thead>
            <tr>
              <th>Companie</th>
              <th>Oameni activi</th>
              <th>În documentare</th>
              <th>La IGM</th>
              <th>De ridicat</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const s = companyStats(data, c.id);
              return (
                <tr key={c.id} className="pipe-row-click" onClick={() => onOpenCompany(c.id)}>
                  <td>
                    <button type="button" className="pipe-link" onClick={() => onOpenCompany(c.id)}>
                      {c.name}
                    </button>
                  </td>
                  <td>{s.total}</td>
                  <td>{s.documentare}</td>
                  <td>{s.igm}</td>
                  <td>{s.ridicare}</td>
                  <td className="btn-row" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => openModal("companyEdit", c.id)}
                    >
                      Modifică
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => onDeleteCompany(c.id)}
                    >
                      Șterge
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="hint">
                  Nicio companie. Adaugă prima firmă ca să începi pipeline-ul.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PipelineCompanyPeopleView({
  data,
  companyId,
  openModal,
  onBack,
  onOpenPerson,
  onDeleteCompany,
  onArchivePerson,
}: {
  data: IgmData;
  companyId: string;
  openModal: OpenModal;
  onBack: () => void;
  onOpenPerson: (id: string) => void;
  onDeleteCompany: (id: string) => void;
  onArchivePerson: (id: string) => void;
}) {
  const company = data.companies.find((c) => c.id === companyId);
  const people = data.candidates.filter((c) => !c.deletedAt && c.companyId === companyId);

  return (
    <div className="pipe-view">
      <div className="pipe-crumb">
        <button type="button" className="igm-back-btn" onClick={onBack}>
          ← Înapoi la companii
        </button>
        <span className="pipe-crumb-sep">/</span>
        <strong>{company?.name || "Companie"}</strong>
      </div>
      <div className="pipe-title-row">
        <div>
          <h1>{company?.name || "Companie"}</h1>
          <p className="lead">{people.length} candidați · priveliște pași</p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => openModal("candidate")}>
            ＋ Adaugă candidat
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => openModal("companyEdit", companyId)}
          >
            Modifică firmă
          </button>
          <button
            type="button"
            className="btn btn-danger-soft"
            onClick={() => onDeleteCompany(companyId)}
            title="Șterge toată firma"
          >
            Șterge firmă
          </button>
        </div>
      </div>
      <div className="card-plain pipe-matrix-card">
        <table className="pipe-matrix">
          <thead>
            <tr>
              <th className="pipe-matrix-name">Candidat</th>
              {PIPELINE_STEPS.map((s) => (
                <th key={s}>{shortStep(s)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const current = inferPipelineStep(data, p);
              const curIdx = stepIndex(current);
              return (
                <tr key={p.id} className="pipe-matrix-row" onClick={() => onOpenPerson(p.id)}>
                  <td className="pipe-matrix-name">
                    <button type="button" className="pipe-link" onClick={() => onOpenPerson(p.id)}>
                      {cn(p)}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger pipe-row-del-btn"
                      title="Șterge acest candidat"
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchivePerson(p.id);
                      }}
                    >
                      Șterge candidat
                    </button>
                  </td>
                  {PIPELINE_STEPS.map((s, i) => {
                    const state = i < curIdx ? "done" : i === curIdx ? "now" : "todo";
                    return (
                      <td key={s} className="pipe-matrix-cell">
                        <span className={`pipe-matrix-dot ${state}`} title={`${shortStep(s)} · ${state === "done" ? "făcut" : state === "now" ? "curent" : "nu încă"}`}>
                          {state === "done" ? "✓" : state === "now" ? "●" : ""}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {!people.length ? (
              <tr>
                <td colSpan={PIPELINE_STEPS.length + 1} className="hint">
                  Niciun candidat la această firmă.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="pipe-matrix-legend" aria-hidden>
          <span>
            <i className="pipe-matrix-dot done">✓</i> făcut
          </span>
          <span>
            <i className="pipe-matrix-dot now">●</i> curent
          </span>
          <span>
            <i className="pipe-matrix-dot todo" /> încă nu
          </span>
        </div>
      </div>
    </div>
  );
}

export function PipelinePersonView({
  data,
  candidateId,
  onBackCompanies,
  onBackCompany,
  onAdvance,
  onRollback,
  onUpload,
  onDeleteFile,
  onSetDeadline,
  onCreatePickup,
  onArchive,
  busy,
}: {
  data: IgmData;
  candidateId: string;
  onBackCompanies: () => void;
  onBackCompany: () => void;
  onAdvance: (step: PipelineStep) => void;
  onRollback: (step: PipelineStep) => void;
  onUpload: (file: File, docType: string) => Promise<void>;
  onDeleteFile: (fileId: number) => Promise<void>;
  onSetDeadline: (deadline: string) => void;
  onCreatePickup: (body: {
    companyId: string;
    date: string;
    notes: string;
    items: { type: string; quantity: number }[];
  }) => Promise<void>;
  onArchive: () => void;
  busy: boolean;
}) {
  const person = data.candidates.find((c) => c.id === candidateId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("Contract");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const currentStep = person ? inferPipelineStep(data, person) : "Cerere firmă";

  useEffect(() => {
    setDocType(defaultDocTypeForStep(currentStep));
    setAdvanceError(null);
  }, [currentStep, candidateId]);

  if (!person) {
    return (
      <div className="pipe-view">
        <p className="hint">Candidatul nu a fost găsit.</p>
        <button type="button" className="btn btn-ghost" onClick={onBackCompanies}>
          Înapoi la companii
        </button>
      </div>
    );
  }

  const step = inferPipelineStep(data, person);
  const idx = stepIndex(step);
  const days = stepDeadlineDays(data, person, step);
  const company = companyName(data, person.companyId);
  const next = PIPELINE_STEPS[Math.min(idx + 1, PIPELINE_STEPS.length - 1)];
  const prev = previousStep(step);
  const checks = advanceChecklist(data, person, step);
  const gate = canAdvance(data, person, step);
  const history = (data.audit || [])
    .filter((a) => a.table === "candidates" && a.recordId === person.id)
    .slice(0, 8) as IgmAuditEntry[];

  function tryAdvance() {
    const g = canAdvance(data, person!, step);
    if (!g.ok) {
      setAdvanceError(`Nu poți avansa: ${g.blockers.join("; ")}`);
      return;
    }
    setAdvanceError(null);
    onAdvance(next);
  }

  return (
    <div className="pipe-view pipe-person">
      <div className="pipe-crumb">
        <button type="button" className="igm-back-btn" onClick={onBackCompany}>
          ← Înapoi la {company}
        </button>
        <span className="pipe-crumb-sep">/</span>
        <button type="button" className="pipe-crumb-link" onClick={onBackCompanies}>
          Companii
        </button>
        <span className="pipe-crumb-sep">/</span>
        <strong>{cn(person)}</strong>
      </div>

      <div className="pipe-person-head">
        <div>
          <h1>{cn(person)}</h1>
          <div className="pipe-person-meta">
            <span className="pipe-avatar" aria-hidden />
            <span>{company}</span>
            <span>·</span>
            <span>{person.status || "Candidat"}</span>
          </div>
        </div>
        <div className="pipe-actions">
          {prev ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => onRollback(prev)}
              title="Revocă ultimul pas"
            >
              Rollback: {shortStep(prev)}
            </button>
          ) : null}
          {step !== "Finalizat" ? (
            <button
              type="button"
              className="btn"
              disabled={busy || !gate.ok}
              onClick={tryAdvance}
              title={
                !gate.ok
                  ? gate.blockers.join("; ")
                  : `Ești pe „${shortStep(step)}”. Confirmă pasul și treci la „${shortStep(next)}”.`
              }
            >
              Confirmă {shortStep(step)} → {shortStep(next)}
            </button>
          ) : null}
          <button type="button" className="btn btn-danger" disabled={busy} onClick={onArchive}>
            Șterge candidat
          </button>
        </div>
      </div>

      <div className="pipe-stepper" role="list" aria-label="Pași dosar">
        {PIPELINE_STEPS.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? "current" : "todo";
          return (
            <div key={s} className={`pipe-step ${state}`} role="listitem">
              <div className="pipe-step-dot">{i < idx ? "✓" : i + 1}</div>
              <div className="pipe-step-label">{shortStep(s)}</div>
              {i === idx && days !== null ? (
                <div className="pipe-step-days">
                  {days < 0 ? `Întârziat ${Math.abs(days)}z` : `${days} zile proces`}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {advanceError ? <div className="error">{advanceError}</div> : null}

      <div className="pipe-person-grid pipe-person-grid-3">
        <div className="pipe-panel">
          <h3>Checklist pas</h3>
          {checks.length ? (
            <ul className="pipe-check">
              {checks.map((x) => (
                <li key={x.id} className={x.ok ? "ok" : "miss"}>
                  <span>{x.ok ? "OK" : "!"}</span>
                  {x.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Nicio condiție obligatorie pe acest pas.</p>
          )}
          <h3>Termen proces</h3>
          <p className="hint">Separat de expirarea permisului / invitației.</p>
          <div className="pipe-deadline">
            <input
              type="date"
              className="igm-input"
              value={person.pipelineDeadline?.slice(0, 10) || ""}
              disabled={busy}
              onChange={(e) => onSetDeadline(e.target.value)}
            />
            {person.pipelineDeadline ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => onSetDeadline("")}
              >
                Șterge termen
              </button>
            ) : null}
          </div>
          <h3>Ce urmează</h3>
          <ul>
            {nextItems(step).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <h3>Ce s-a făcut</h3>
          <ul>
            {doneItems(step).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="pipe-panel">
          {step === "Documentare" ? (
            <ProcessCalendarPanel
              deadline={person.pipelineDeadline?.slice(0, 10) || ""}
              busy={busy}
              onSetDeadline={onSetDeadline}
            />
          ) : step === "Ridicare" ? (
            <QuickPickupPanel
              data={data}
              companyId={person.companyId}
              busy={busy}
              onCreatePickup={onCreatePickup}
            />
          ) : (
            <CandidateDocsPanel
              data={data}
              candidateId={person.id}
              busy={busy}
              defaultType={docType}
              onDefaultTypeChange={setDocType}
              onUpload={onUpload}
              onDeleteFile={onDeleteFile}
              uploadError={uploadError}
              setUploadError={setUploadError}
              fileRef={fileRef}
            />
          )}
        </div>
        <div className="pipe-panel">
          <h3>Istoric</h3>
          {history.length ? (
            <ul className="pipe-history">
              {history.map((h) => (
                <li key={h.id}>
                  <strong>{h.action}</strong>
                  <span>
                    {h.actor} · {h.createdAt?.slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Încă nu sunt acțiuni înregistrate pe acest dosar.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProcessCalendarPanel({
  deadline,
  busy,
  onSetDeadline,
}: {
  deadline: string;
  busy: boolean;
  onSetDeadline: (deadline: string) => void;
}) {
  const [draft, setDraft] = useState(deadline || today());

  useEffect(() => {
    setDraft(deadline || today());
  }, [deadline]);

  return (
    <div className="pipe-cal-panel">
      <h3>Calendar proces</h3>
      <p className="hint">
        La Documentare nu încărcăm fișiere aici — setează doar data-termen pentru acest pas.
      </p>
      <input
        type="date"
        className="igm-input pipe-cal-input"
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="pipe-cal-actions">
        <button
          type="button"
          className="btn"
          disabled={busy || !draft}
          onClick={() => onSetDeadline(draft)}
        >
          Salvează data
        </button>
        {deadline ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => onSetDeadline("")}
          >
            Șterge termen
          </button>
        ) : null}
      </div>
      {deadline ? (
        <p className="pipe-cal-set">
          Termen setat: <strong>{fmt(deadline)}</strong>
        </p>
      ) : (
        <p className="hint">Niciun termen salvat încă.</p>
      )}
    </div>
  );
}

function QuickPickupPanel({
  data,
  companyId,
  busy,
  onCreatePickup,
}: {
  data: IgmData;
  companyId: string;
  busy: boolean;
  onCreatePickup: (body: {
    companyId: string;
    date: string;
    notes: string;
    items: { type: string; quantity: number }[];
  }) => Promise<void>;
}) {
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({
    Invitatii: 0,
    Decizii: 0,
    "Permise de sedere": 0,
    Pasapoarte: 0,
    Caziere: 0,
  });

  const recent = data.pickups
    .filter((p) => active(p) && p.companyId === companyId)
    .slice(0, 4);

  function toggle(type: string) {
    setSelected((prev) => ({
      ...prev,
      [type]: prev[type] > 0 ? 0 : 1,
    }));
  }

  async function submit() {
    const items = Object.entries(selected)
      .filter(([, qty]) => qty > 0)
      .map(([type, quantity]) => ({ type, quantity }));
    if (!items.length) {
      setError("Bifează cel puțin un tip (decizie / invitație / permis…).");
      return;
    }
    setError(null);
    try {
      await onCreatePickup({ companyId, date, notes, items });
      setSelected({
        Invitatii: 0,
        Decizii: 0,
        "Permise de sedere": 0,
        Pasapoarte: 0,
        Caziere: 0,
      });
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ridicare eșuată");
    }
  }

  return (
    <div className="pipe-pickup-panel">
      <h3>Ridicare rapidă</h3>
      <p className="hint">
        În aceeași zi poți bifa mai multe tipuri pentru firmă — decizie + invitație + permis etc.
      </p>
      <label className="pipe-pickup-date">
        Data ridicării
        <input
          type="date"
          className="igm-input"
          value={date}
          disabled={busy}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <div className="pipe-pickup-types">
        {PICKUP_QUICK_TYPES.map((type) => {
          const on = selected[type] > 0;
          return (
            <label key={type} className={`pipe-pickup-chip ${on ? "on" : ""}`}>
              <input
                type="checkbox"
                checked={on}
                disabled={busy}
                onChange={() => toggle(type)}
              />
              <span>{type}</span>
              {on ? (
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="pipe-pickup-qty"
                  value={selected[type]}
                  disabled={busy}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSelected((prev) => ({
                      ...prev,
                      [type]: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              ) : null}
            </label>
          );
        })}
      </div>
      <label className="pipe-pickup-notes">
        Observații
        <textarea
          className="igm-input"
          rows={2}
          value={notes}
          disabled={busy}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Opțional"
        />
      </label>
      {error ? <div className="error">{error}</div> : null}
      <button type="button" className="btn" disabled={busy} onClick={() => void submit()}>
        Înregistrează ridicarea
      </button>

      <h3 className="pipe-pickup-recent-title">Ridicări recente firmă</h3>
      {recent.length ? (
        <ul className="pipe-pickup-recent">
          {recent.map((p) => {
            const items = data.pickupItems.filter((i) => i.pickupId === p.id);
            return (
              <li key={p.id}>
                <strong>{fmt(p.date)}</strong>
                <small>{items.map((i) => `${i.type}×${i.quantity}`).join(" · ") || "—"}</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hint">Nicio ridicare încă pentru această firmă.</p>
      )}
    </div>
  );
}

/** Attach / list / download files for a candidate — shared by pipeline + Candidați. */
export function CandidateDocsPanel({
  data,
  candidateId,
  busy,
  defaultType,
  onDefaultTypeChange,
  onUpload,
  onDeleteFile,
  onAddDetailed,
  uploadError,
  setUploadError,
  fileRef,
  title = "Documente",
}: {
  data: IgmData;
  candidateId: string;
  busy: boolean;
  defaultType: string;
  onDefaultTypeChange: (v: string) => void;
  onUpload: (file: File, docType: string) => Promise<void>;
  onDeleteFile?: (fileId: number) => Promise<void>;
  onAddDetailed?: (type: string) => void;
  uploadError: string | null;
  setUploadError: (v: string | null) => void;
  fileRef: RefObject<HTMLInputElement>;
  title?: string;
}) {
  const docs = candidateDocs(data, candidateId);
  const files = data.files.filter((f) => docs.some((d) => d.id === f.documentId));

  const statusRows = CORE_DOC_STATUS.map((type) => {
    const typed = docs.filter((d) => d.type === type);
    const withFile = typed.filter((d) => files.some((f) => f.documentId === d.id));
    const latest = typed[0];
    let state: "ok" | "partial" | "miss" = "miss";
    if (withFile.length) state = "ok";
    else if (typed.length) state = "partial";
    return { type, state, latest, count: typed.length };
  });
  const doneCount = statusRows.filter((r) => r.state === "ok").length;

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setUploadError(null);
    try {
      for (const file of Array.from(list)) {
        await onUpload(file, defaultType);
      }
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload eșuat");
    }
  }

  async function handleDelete(fileId: number) {
    if (!onDeleteFile) return;
    setUploadError(null);
    try {
      await onDeleteFile(fileId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Ștergere eșuată");
    }
  }

  return (
    <>
      <h3>{title}</h3>
      <p className="hint pipe-doc-hint">
        Status pe tipuri — ce e depus vs ce lipsește. Adaugă cu detalii (număr, firmă) ca să se
        sincronizeze în Invitații / Permise / Decizii.
      </p>

      <div className="pipe-doc-status">
        <div className="pipe-doc-status-head">
          <strong>Situație dosar</strong>
          <span>
            {doneCount}/{statusRows.length} cu fișier
          </span>
        </div>
        <ul className="pipe-doc-status-list">
          {statusRows.map((row) => (
            <li key={row.type} className={`pipe-doc-status-item ${row.state}`}>
              <button
                type="button"
                className="pipe-doc-status-btn"
                onClick={() => {
                  onDefaultTypeChange(row.type);
                  if (row.state !== "ok" && onAddDetailed) onAddDetailed(row.type);
                }}
                title={
                  row.state === "ok"
                    ? "Depus"
                    : row.state === "partial"
                      ? "Înregistrat, fără fișier"
                      : "Lipsește — adaugă detalii"
                }
              >
                <span className="pipe-doc-status-mark" aria-hidden>
                  {row.state === "ok" ? "✓" : row.state === "partial" ? "·" : "–"}
                </span>
                <span className="pipe-doc-status-label">{row.type}</span>
                <em>
                  {row.state === "ok"
                    ? row.latest?.number
                      ? `Depus · ${row.latest.number}`
                      : "Depus"
                    : row.state === "partial"
                      ? row.latest?.number
                        ? `Fără fișier · ${row.latest.number}`
                        : "Fără fișier"
                      : "Lipsă"}
                </em>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="pipe-upload">
        <div className="pipe-upload-top">
          <label>
            Tip document
            <select
              className="igm-input"
              value={defaultType}
              onChange={(e) => onDefaultTypeChange(e.target.value)}
            >
              {UPLOAD_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {onAddDetailed ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => onAddDetailed(defaultType)}
            >
              ＋ Detalii ({defaultType})
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/*"
          disabled={busy}
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <p className="hint">Scan rapid: PDF, PNG, JPG… Pentru număr / expirare folosește „Detalii”.</p>
        {uploadError ? <div className="error">{uploadError}</div> : null}
      </div>

      {files.length || docs.length ? (
        <ul className="pipe-docs">
          {files.map((f) => {
            const doc = docs.find((d) => d.id === f.documentId);
            return (
              <li key={f.id} className="has-file">
                <span className="pipe-doc-state ok" aria-hidden>
                  ✓
                </span>
                <a
                  className="pipe-doc-link"
                  href={IgmApi.downloadUrl(f.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {f.originalName}
                </a>
                <span className="pipe-doc-meta">
                  {doc?.type || "Document"}
                  {doc?.number ? ` · ${doc.number}` : ""}
                </span>
                {onDeleteFile ? (
                  <button
                    type="button"
                    className="pipe-doc-del"
                    disabled={busy}
                    onClick={() => void handleDelete(f.id)}
                  >
                    Șterge
                  </button>
                ) : null}
              </li>
            );
          })}
          {docs
            .filter((d) => !files.some((f) => f.documentId === d.id))
            .map((d) => (
              <li key={d.id} className="no-file">
                <span className="pipe-doc-state partial" aria-hidden>
                  !
                </span>
                <span className="pipe-doc-link">
                  {d.type}
                  {d.number ? ` · ${d.number}` : ""}
                </span>
                <span className="pipe-doc-meta">înregistrat, fără fișier</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="hint">Nu sunt documente încărcate.</p>
      )}
    </>
  );
}

function shortStep(step: PipelineStep): string {
  if (step === "Cerere firmă") return "Cerere";
  if (step === "Sosire Moldova") return "Sosire";
  if (step === "Contract semnat") return "Contract";
  return step;
}

function statusColor(label: string): string {
  if (label === "Urgent") return "red";
  if (label === "Aproape") return "yellow";
  if (label === "Completat") return "green";
  return "blue";
}
