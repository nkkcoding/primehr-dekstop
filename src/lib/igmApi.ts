import { getHostBase, getStoredToken } from "./api";

export interface IgmCompany {
  id: string;
  name: string;
  createdAt: string;
  deletedAt: string;
}

export interface IgmCandidate {
  id: string;
  firstName: string;
  lastName: string;
  companyId: string;
  status: string;
  notes: string;
  createdAt: string;
  deletedAt: string;
  archiveReason: string;
  lastWorkDate: string;
  pipelineStep?: string;
  /** ISO timestamp when current pipeline step started — for process SLA only. */
  pipelineStepAt?: string;
  /** Explicit process deadline YYYY-MM-DD (not document expiry). */
  pipelineDeadline?: string;
}

export interface IgmAuditEntry {
  id: string;
  table: string;
  recordId: string;
  action: string;
  before: string;
  after: string;
  actor: string;
  createdAt: string;
}

export interface IgmDocument {
  id: string;
  candidateId: string;
  companyId: string;
  type: string;
  number: string;
  issueDate: string;
  expiryDate: string;
  alertDays: string;
  notes: string;
  createdAt: string;
  trackingNumber: string;
  sentDate: string;
  deliveryDate: string;
  deletedAt: string;
  batchId: string;
}

export interface IgmSubmission {
  id: string;
  candidateId: string;
  companyId: string;
  type: string;
  number: string;
  date: string;
  notes: string;
  createdAt: string;
  scheduledDate: string;
  status: string;
  deletedAt: string;
}

export interface IgmPickup {
  id: string;
  companyId: string;
  date: string;
  notes: string;
  createdAt: string;
  deletedAt: string;
}

export interface IgmPickupItem {
  id: string;
  pickupId: string;
  type: string;
  quantity: number;
  createdAt: string;
}

export interface IgmTransfer {
  id: string;
  candidateId: string;
  fromCompanyId: string;
  toCompanyId: string;
  effectiveDate: string;
  notes: string;
  changedBy: string;
  createdAt: string;
}

export interface IgmAck {
  id: string;
  category: string;
  recordId: string;
  fingerprint: string;
  actor: string;
  createdAt: string;
}

export interface IgmFile {
  id: number;
  documentId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: number;
  createdAt: string;
}

export interface IgmData {
  companies: IgmCompany[];
  candidates: IgmCandidate[];
  documents: IgmDocument[];
  submissions: IgmSubmission[];
  pickups: IgmPickup[];
  pickupItems: IgmPickupItem[];
  transfers: IgmTransfer[];
  audit: IgmAuditEntry[];
  acknowledgements: IgmAck[];
  files: IgmFile[];
}

async function api<T>(path: string, options: RequestInit & { formData?: FormData } = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!options.formData && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${getHostBase()}/api/igm${path}`, {
    ...options,
    headers,
    body: options.formData ?? options.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Eroare HTTP ${res.status}`);
  }
  return data as T;
}

export const IgmApi = {
  data: () => api<IgmData>("/data"),
  addCompany: (name: string) =>
    api<{ company: IgmCompany }>("/companies", { method: "POST", body: JSON.stringify({ name }) }),
  updateCompany: (id: string, name: string) =>
    api<{ company: IgmCompany }>(`/companies/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  addCandidate: (body: Record<string, unknown>) =>
    api<{ candidate: IgmCandidate }>("/candidates", { method: "POST", body: JSON.stringify(body) }),
  updateCandidate: (id: string, body: Record<string, unknown>) =>
    api<{ candidate: IgmCandidate }>(`/candidates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  archiveCandidate: (id: string, reason: string, lastWorkDate: string) =>
    api<{ candidate: IgmCandidate }>(`/candidates/${id}/archive`, {
      method: "POST",
      body: JSON.stringify({ reason, lastWorkDate }),
    }),
  restoreCandidate: (id: string) =>
    api<{ candidate: IgmCandidate }>(`/candidates/${id}/restore`, { method: "POST", body: "{}" }),
  transfer: (body: Record<string, unknown>) =>
    api<{ transfer: IgmTransfer }>("/transfers", { method: "POST", body: JSON.stringify(body) }),
  addDocument: (body: Record<string, unknown>) =>
    api<{ document: IgmDocument }>("/documents", { method: "POST", body: JSON.stringify(body) }),
  updateDocument: (id: string, body: Record<string, unknown>) =>
    api<{ document: IgmDocument }>(`/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  cazierBatch: (body: Record<string, unknown>) =>
    api<{ batchId: string; count: number }>("/documents/cazier-batch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addSubmission: (body: Record<string, unknown>) =>
    api<{ submission: IgmSubmission }>("/submissions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSubmission: (id: string, body: Record<string, unknown>) =>
    api<{ submission: IgmSubmission }>(`/submissions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  addPickup: (body: Record<string, unknown>) =>
    api<{ pickup: IgmPickup }>("/pickups", { method: "POST", body: JSON.stringify(body) }),
  updatePickup: (id: string, body: Record<string, unknown>) =>
    api<{ pickup: IgmPickup }>(`/pickups/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  softDelete: (table: string, id: string, reason: string) =>
    api<{ ok: boolean }>("/soft-delete", {
      method: "POST",
      body: JSON.stringify({ table, id, reason }),
    }),
  markSeen: (category: string, items: { id: string; fingerprint: string }[]) =>
    api<{ marked: number }>("/mark-seen", {
      method: "POST",
      body: JSON.stringify({ category, items }),
    }),
  uploadFile: (documentId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api<{ file: IgmFile }>(`/documents/${documentId}/files`, {
      method: "POST",
      formData: fd,
    });
  },
  deleteFile: (fileId: number) =>
    api<{ ok: boolean }>(`/files/${fileId}`, { method: "DELETE" }),
  downloadUrl: (fileId: number) =>
    `${getHostBase()}/api/igm/files/${fileId}/download?token=${encodeURIComponent(getStoredToken() || "")}`,
};

export const IGM_PAGES = [
  "Dashboard",
  "Companii",
  "Candidați",
  "Alerte & Termene",
  "Rapoarte",
  "Căutare globală",
  "Calendar IGM",
  "Invitații",
  "Decizii",
  "Permise de ședere",
  "Caziere",
  "Pașapoarte Nepal",
  "Dosare la IGM",
  "Ridicări de la IGM",
  "Schimbări candidați",
  "Candidați arhivați",
] as const;

export type IgmPageName = (typeof IGM_PAGES)[number];

export const DOC_TYPE_BY_PAGE: Partial<Record<IgmPageName, string>> = {
  Invitații: "Invitatie",
  Decizii: "Decizie",
  "Permise de ședere": "Permis de sedere",
  Caziere: "Cazier",
  "Pașapoarte Nepal": "Pasaport Nepal",
};
