import type { ConnectionConfig } from "../vite-env";

export type Role = "ADMIN" | "MANAGER" | "CEO" | "IGM";

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface CaseItem {
  id: string;
  title: string;
  status: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface CaseFile {
  id: number;
  case_id: string;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: number;
  created_at: string;
}

export interface NavItem {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
}

const TOKEN_KEY = "primehr_token";
const CONFIG_KEY = "primehr_connection";

let memoryConfig: ConnectionConfig | null = null;

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export async function loadConnectionConfig(): Promise<ConnectionConfig> {
  if (window.primehr?.getConfig) {
    memoryConfig = await window.primehr.getConfig();
    localStorage.setItem(CONFIG_KEY, JSON.stringify(memoryConfig));
    return memoryConfig;
  }
  const raw = localStorage.getItem(CONFIG_KEY);
  if (raw) {
    memoryConfig = JSON.parse(raw) as ConnectionConfig;
    return memoryConfig;
  }
  memoryConfig = { mode: "host", hostUrl: "http://127.0.0.1:3847" };
  return memoryConfig;
}

export async function saveConnectionConfig(config: ConnectionConfig): Promise<ConnectionConfig> {
  if (window.primehr?.setConfig) {
    memoryConfig = await window.primehr.setConfig(config);
  } else {
    memoryConfig = config;
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(memoryConfig));
  return memoryConfig;
}

export function getHostBase(): string {
  return (memoryConfig?.hostUrl || "http://127.0.0.1:3847").replace(/\/$/, "");
}

export function getWsUrl(): string {
  const base = getHostBase();
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  u.search = "";
  u.hash = "";
  return u.toString();
}

async function api<T>(
  path: string,
  options: RequestInit & { formData?: FormData } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!options.formData && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${getHostBase()}/api${path}`, {
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

export const AuthApi = {
  login: (username: string, password: string) =>
    api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => api<{ user: User }>("/auth/me"),
  logout: () => api<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string | null, newPassword: string) =>
    api<{ user: User }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

export const CasesApi = {
  list: () => api<{ cases: CaseItem[] }>("/cases"),
  create: (title: string, status = "Nou") =>
    api<{ case: CaseItem }>("/cases", {
      method: "POST",
      body: JSON.stringify({ title, status }),
    }),
  get: (id: string) => api<{ case: CaseItem; files: CaseFile[] }>(`/cases/${id}`),
  upload: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api<{ file: CaseFile }>(`/cases/${id}/files`, { method: "POST", formData: fd });
  },
  downloadUrl: (fileId: number) =>
    `${getHostBase()}/api/files/${fileId}/download?token=${encodeURIComponent(getStoredToken() || "")}`,
};

export const NavApi = {
  list: () => api<{ items: NavItem[] }>("/nav"),
};

export async function probeHost(hostUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${hostUrl.replace(/\/$/, "")}/api/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
