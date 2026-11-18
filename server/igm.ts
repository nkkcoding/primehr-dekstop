/**
 * IGM domain helpers — port of Apps Script IGM.gs validation & CRUD.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { SessionUser } from "./auth";

export const DOC_TYPES = [
  "Permis de sedere",
  "Invitatie",
  "Decizie",
  "Pasaport Nepal",
  "Cazier",
  "Contract",
  "Alt document",
] as const;

export const SUBMISSION_TYPES = [
  "Dosar invitatie",
  "Dosar decizie",
  "Invitatie + Decizie",
  "Alt dosar",
] as const;

export const SUBMISSION_STATUSES = ["Programat", "Depus", "Amânat", "Anulat"] as const;

export const PICKUP_ITEM_TYPES = [
  "Invitatii",
  "Decizii",
  "Permise de sedere",
  "Pasapoarte",
  "Caziere",
  "Altele",
] as const;

export class IgmError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "IgmError";
    this.status = status;
  }
}

export function requireIgmAccess(user: SessionUser): void {
  if (user.role !== "IGM" && user.role !== "ADMIN" && user.role !== "CEO") {
    throw new IgmError("Acces permis doar IGM, Admin și CEO.", 403);
  }
}

function now(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function igmId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function igmText(s: unknown, max: number): string {
  let v = String(s ?? "").trim();
  if (v.length > max) throw new IgmError("Text prea lung.");
  if (/^[=+@\-\t\r]/.test(v)) v = "'" + v;
  return v;
}

export function igmRequired(s: unknown, max: number): string {
  const v = igmText(s, max);
  if (!v) throw new IgmError("Completează câmpurile obligatorii.");
  return v;
}

export function igmDate(s: unknown): string {
  const v = String(s ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new IgmError("Dată invalidă.");
  const d = new Date(v + "T12:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    throw new IgmError("Dată invalidă.");
  }
  return v;
}

export function companyKey(name: string): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function actorLabel(user: SessionUser): string {
  return igmText(user.username || user.displayName || user.role, 100);
}

export function writeAudit(
  table: string,
  recordId: string,
  action: string,
  before: unknown,
  after: unknown,
  user: SessionUser,
): void {
  getDb()
    .prepare(
      `INSERT INTO igm_audit (id, table_name, record_id, action, before_json, after_json, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      igmId("AUD"),
      table,
      recordId,
      action,
      JSON.stringify(before ?? {}),
      JSON.stringify(after ?? {}),
      actorLabel(user),
      now(),
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadIgmBundle(): Record<string, any[]> {
  const db = getDb();
  const companies = db.prepare("SELECT * FROM igm_companies ORDER BY name COLLATE NOCASE").all();
  const candidates = db
    .prepare("SELECT * FROM igm_candidates ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE")
    .all();
  const documents = db.prepare("SELECT * FROM igm_documents ORDER BY created_at DESC").all();
  const submissions = db.prepare("SELECT * FROM igm_submissions ORDER BY created_at DESC").all();
  const pickups = db.prepare("SELECT * FROM igm_pickups ORDER BY date DESC, created_at DESC").all();
  const pickupItems = db.prepare("SELECT * FROM igm_pickup_items ORDER BY created_at").all();
  const transfers = db.prepare("SELECT * FROM igm_transfers ORDER BY created_at DESC").all();
  const audit = db.prepare("SELECT * FROM igm_audit ORDER BY created_at DESC LIMIT 500").all();
  const acknowledgements = db.prepare("SELECT * FROM igm_acknowledgements").all();
  const files = db.prepare("SELECT * FROM igm_files ORDER BY created_at DESC").all();

  return {
    companies: companies.map(mapCompany),
    candidates: candidates.map(mapCandidate),
    documents: documents.map(mapDocument),
    submissions: submissions.map(mapSubmission),
    pickups: pickups.map(mapPickup),
    pickupItems: pickupItems.map(mapPickupItem),
    transfers: transfers.map(mapTransfer),
    audit: audit.map(mapAudit),
    acknowledgements: acknowledgements.map(mapAck),
    files: files.map(mapFile),
  };
}

function mapCompany(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    deletedAt: r.deleted_at || "",
  };
}

function mapCandidate(r: Record<string, unknown>) {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    companyId: r.company_id || "",
    status: r.status,
    notes: r.notes || "",
    createdAt: r.created_at,
    deletedAt: r.deleted_at || "",
    archiveReason: r.archive_reason || "",
    lastWorkDate: r.last_work_date || "",
    pipelineStep: String(r.pipeline_step || "Cerere firmă"),
    pipelineStepAt: String(r.pipeline_step_at || r.created_at || ""),
    pipelineDeadline: String(r.pipeline_deadline || ""),
  };
}

function mapDocument(r: Record<string, unknown>) {
  return {
    id: r.id,
    candidateId: r.candidate_id,
    companyId: r.company_id || "",
    type: r.type,
    number: r.number || "",
    issueDate: r.issue_date || "",
    expiryDate: r.expiry_date || "",
    alertDays: r.alert_days === null || r.alert_days === "" ? "" : String(r.alert_days),
    notes: r.notes || "",
    createdAt: r.created_at,
    trackingNumber: r.tracking_number || "",
    sentDate: r.sent_date || "",
    deliveryDate: r.delivery_date || "",
    deletedAt: r.deleted_at || "",
    batchId: r.batch_id || "",
  };
}

function mapSubmission(r: Record<string, unknown>) {
  return {
    id: r.id,
    candidateId: r.candidate_id || "",
    companyId: r.company_id || "",
    type: r.type,
    number: r.number || "",
    date: r.date || "",
    notes: r.notes || "",
    createdAt: r.created_at,
    scheduledDate: r.scheduled_date || "",
    status: r.status,
    deletedAt: r.deleted_at || "",
  };
}

function mapPickup(r: Record<string, unknown>) {
  return {
    id: r.id,
    companyId: r.company_id,
    date: r.date,
    notes: r.notes || "",
    createdAt: r.created_at,
    deletedAt: r.deleted_at || "",
  };
}

function mapPickupItem(r: Record<string, unknown>) {
  return {
    id: r.id,
    pickupId: r.pickup_id,
    type: r.type,
    quantity: Number(r.quantity),
    createdAt: r.created_at,
  };
}

function mapTransfer(r: Record<string, unknown>) {
  return {
    id: r.id,
    candidateId: r.candidate_id,
    fromCompanyId: r.from_company_id || "",
    toCompanyId: r.to_company_id,
    effectiveDate: r.effective_date,
    notes: r.notes || "",
    changedBy: r.changed_by,
    createdAt: r.created_at,
  };
}

function mapAudit(r: Record<string, unknown>) {
  return {
    id: r.id,
    table: r.table_name,
    recordId: r.record_id,
    action: r.action,
    before: r.before_json,
    after: r.after_json,
    actor: r.actor,
    createdAt: r.created_at,
  };
}

function mapAck(r: Record<string, unknown>) {
  return {
    id: r.id,
    category: r.category,
    recordId: r.record_id,
    fingerprint: r.fingerprint,
    actor: r.actor,
    createdAt: r.created_at,
  };
}

function mapFile(r: Record<string, unknown>) {
  return {
    id: r.id,
    documentId: r.document_id,
    originalName: r.original_name,
    storedName: r.stored_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  };
}

export function findCompany(id: string) {
  return getDb().prepare("SELECT * FROM igm_companies WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
}

export function findCandidate(id: string) {
  return getDb().prepare("SELECT * FROM igm_candidates WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
}

export function findDocument(id: string) {
  return getDb().prepare("SELECT * FROM igm_documents WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
}

export function requireCompany(id: string): void {
  const c = findCompany(id);
  if (!c) throw new IgmError("Compania nu există.");
}

export function requireActiveCompany(id: string): Record<string, unknown> {
  const c = findCompany(id);
  if (!c || c.deleted_at) throw new IgmError("Compania indisponibilă.");
  return c;
}

export function requireCandidate(id: string): Record<string, unknown> {
  const c = findCandidate(id);
  if (!c) throw new IgmError("Candidatul nu există.");
  return c;
}

export function resolveCompanyId(v: {
  companyId?: string;
  newCompanyName?: string;
}): string {
  const fresh = String(v.newCompanyName || "").trim();
  if (fresh) {
    const key = companyKey(fresh);
    const existing = getDb()
      .prepare("SELECT * FROM igm_companies")
      .all()
      .find((c) => companyKey(String((c as { name: string }).name)) === key) as
      | Record<string, unknown>
      | undefined;
    if (existing) {
      if (existing.deleted_at) throw new IgmError("Compania există în arhivă. Reactiveaz-o mai întâi.");
      return String(existing.id);
    }
    const id = igmId("CMP");
    getDb()
      .prepare(
        `INSERT INTO igm_companies (id, name, created_at, deleted_at) VALUES (?, ?, ?, '')`,
      )
      .run(id, igmRequired(fresh, 120), now());
    return id;
  }
  const id = String(v.companyId || "").trim();
  if (id) requireActiveCompany(id);
  return id;
}

export function resolveCandidateId(
  v: {
    candidateId?: string;
    newFirstName?: string;
    newLastName?: string;
  },
  companyId: string,
): string {
  const id = String(v.candidateId || "").trim();
  const first = String(v.newFirstName || "").trim();
  const last = String(v.newLastName || "").trim();
  if (id && (first || last)) {
    throw new IgmError("Selectează candidatul existent SAU introdu unul nou.");
  }
  if (id) {
    const c = requireCandidate(id);
    if (c.deleted_at) throw new IgmError("Candidatul este arhivat.");
    if (companyId && c.company_id && companyId !== c.company_id) {
      throw new IgmError("Candidatul aparține altei companii. Folosește transferul.");
    }
    return id;
  }
  if (!first || !last) throw new IgmError("Alege un candidat sau completează prenumele și numele.");
  const newId = igmId("CND");
  getDb()
    .prepare(
      `INSERT INTO igm_candidates
       (id, first_name, last_name, company_id, status, notes, created_at, deleted_at, archive_reason, last_work_date, pipeline_step, pipeline_step_at, pipeline_deadline)
       VALUES (?, ?, ?, ?, 'În procesare', ?, ?, '', '', '', 'Cerere firmă', ?, '')`,
    )
    .run(
      newId,
      igmRequired(first, 100),
      igmRequired(last, 100),
      companyId,
      "Creat din modulul documente IGM",
      now(),
      now(),
    );
  return newId;
}

export function documentFields(v: Record<string, unknown>): {
  type: string;
  number: string;
  issueDate: string;
  expiryDate: string;
  alertDays: string | number;
  notes: string;
  trackingNumber: string;
  sentDate: string;
  deliveryDate: string;
} {
  const type = String(v.type || "");
  if (!(DOC_TYPES as readonly string[]).includes(type)) {
    throw new IgmError("Tip document invalid.");
  }
  const passport = type === "Pasaport Nepal";
  const loose = type === "Contract" || type === "Alt document";
  const issue = v.issueDate ? igmDate(v.issueDate) : loose ? now().slice(0, 10) : "";
  const sentDate = passport ? igmDate(v.sentDate) : "";
  const deliveryDate = passport && v.deliveryDate ? igmDate(v.deliveryDate) : "";
  if (!passport && !issue) throw new IgmError("Data emiterii este obligatorie.");
  let expiry = v.expiryDate ? igmDate(v.expiryDate) : "";
  if (type === "Invitatie" && !expiry) {
    const d = new Date(issue + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 90);
    expiry = d.toISOString().slice(0, 10);
  }
  if (expiry && issue && expiry < issue) throw new IgmError("Data expirării precede emiterea.");
  if (deliveryDate && deliveryDate < sentDate) {
    throw new IgmError("Data livrării precede expedierea.");
  }
  const alertRaw = v.alertDays === undefined || v.alertDays === "" ? 30 : Number(v.alertDays);
  if (!Number.isInteger(alertRaw) || alertRaw < 0 || alertRaw > 365) {
    throw new IgmError("Alertă invalidă.");
  }
  return {
    type,
    number: igmText(v.number, 100),
    issueDate: issue,
    expiryDate: expiry,
    alertDays: passport ? "" : alertRaw,
    notes: igmText(v.notes, 1000),
    trackingNumber: passport ? igmRequired(v.trackingNumber, 120) : "",
    sentDate,
    deliveryDate,
  };
}

export function submissionStatus(x: string): string {
  if (!(SUBMISSION_STATUSES as readonly string[]).includes(x)) {
    throw new IgmError("Status invalid.");
  }
  return x;
}

export function stampNow(): string {
  return now();
}
