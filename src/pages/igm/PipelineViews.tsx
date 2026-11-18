import { useEffect, useRef, useState, type RefObject } from "react";
import type { IgmData } from "../../lib/igmApi";
import { IgmApi } from "../../lib/igmApi";
import { activeCompanies, cn, companyName } from "./igmHelpers";
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

type OpenModal = (kind: "company" | "companyEdit" | "candidate", id?: string) => void;

const UPLOAD_DOC_TYPES = [
  "Contract",
  "Pasaport Nepal",
  "Invitatie",
  "Decizie",
  "Permis de sedere",
  "Cazier",
  "Alt document",
] as const;

export function PipelineCompaniesView({
  data,
  filter,
  setFilter,
  openModal,
  onOpenCompany,
}: {
  data: IgmData;
  filter: string;
  setFilter: (v: string) => void;
  openModal: OpenModal;
  onOpenCompany: (id: string) => void;
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
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="hint">
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
}: {
  data: IgmData;
  companyId: string;
  openModal: OpenModal;
  onBack: () => void;
  onOpenPerson: (id: string) => void;
}) {
  const company = data.companies.find((c) => c.id === companyId);
  const people = data.candidates.filter((c) => !c.deletedAt && c.companyId === companyId);

  return (
    <div className="pipe-view">
      <div className="pipe-crumb">
        <button type="button" className="pipe-crumb-link" onClick={onBack}>
          Companii
        </button>
        <span>/</span>
        <strong>{company?.name || "Companie"}</strong>
      </div>
      <div className="pipe-title-row">
        <div>
          <h1>{company?.name || "Companie"}</h1>
          <p className="lead">{people.length} candidați activi</p>
        </div>
        <button type="button" className="btn" onClick={() => openModal("candidate")}>
          ＋ Adaugă candidat
        </button>
      </div>
      <div className="card-plain pipe-table-card">
        <table className="table pipe-table">
          <thead>
            <tr>
              <th>Candidat</th>
              <th>Pas curent</th>
              <th>Termen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const step = inferPipelineStep(data, p);
              const days = stepDeadlineDays(data, p, step);
              return (
                <tr key={p.id} className="pipe-row-click" onClick={() => onOpenPerson(p.id)}>
                  <td>
                    <button type="button" className="pipe-link" onClick={() => onOpenPerson(p.id)}>
                      {cn(p)}
                    </button>
                  </td>
                  <td>
                    <span className="pipe-step-chip">{step}</span>
                  </td>
                  <td>{days === null ? "—" : `${days} zile`}</td>
                  <td>
                    <span className={`igm-chip ${statusColor(stepStatusLabel(days, step))}`}>
                      {stepStatusLabel(days, step)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!people.length ? (
              <tr>
                <td colSpan={4} className="hint">
                  Niciun candidat la această firmă.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
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
        <button type="button" className="pipe-crumb-link" onClick={onBackCompanies}>
          Companii
        </button>
        <span>/</span>
        <button type="button" className="pipe-crumb-link" onClick={onBackCompany}>
          {company}
        </button>
        <span>/</span>
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
              title={!gate.ok ? gate.blockers.join("; ") : undefined}
            >
              Marchează: {shortStep(next)}
            </button>
          ) : null}
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

/** Attach / list / download files for a candidate — shared by pipeline + Candidați. */
export function CandidateDocsPanel({
  data,
  candidateId,
  busy,
  defaultType,
  onDefaultTypeChange,
  onUpload,
  onDeleteFile,
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
  uploadError: string | null;
  setUploadError: (v: string | null) => void;
  fileRef: RefObject<HTMLInputElement>;
  title?: string;
}) {
  const docs = candidateDocs(data, candidateId);
  const files = data.files.filter((f) => docs.some((d) => d.id === f.documentId));

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
        Alege tipul (contract, invitație, decizie, permis…) și atașează scanarea. Vizibil pentru toți pe
        host.
      </p>
      <div className="pipe-upload">
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
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/*"
          disabled={busy}
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <p className="hint">PDF, PNG, JPG, DOC, DOCX, XLS, XLSX</p>
        {uploadError ? <div className="error">{uploadError}</div> : null}
      </div>

      {files.length || docs.length ? (
        <ul className="pipe-docs">
          {files.map((f) => {
            const doc = docs.find((d) => d.id === f.documentId);
            return (
              <li key={f.id}>
                <a
                  className="pipe-doc-link"
                  href={IgmApi.downloadUrl(f.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {f.originalName}
                </a>
                <span className="pipe-doc-meta">{doc?.type || "Document"}</span>
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
              <li key={d.id}>
                <span className="pipe-doc-link">
                  {d.type}
                  {d.number ? ` · ${d.number}` : ""}
                </span>
                <span className="pipe-doc-meta">fără fișier</span>
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
