import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";

type PrimeHrMode = "host" | "client";

interface ConnectionConfig {
  mode: PrimeHrMode;
  hostUrl: string;
}

const DEFAULT_PORT = Number(process.env.PRIMEHR_PORT || 3847);
const CONFIG_NAME = "connection.json";

let mainWindow: BrowserWindow | null = null;
let hostHandle: { close: () => Promise<void> } | null = null;

/** App code root: project cwd in dev, asar/app path when packaged. */
function appRoot(): string {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  return path.resolve(process.cwd());
}

function preloadPath(): string {
  return path.join(appRoot(), "dist-electron", "preload.js");
}

function userDataConfigPath(): string {
  return path.join(app.getPath("userData"), CONFIG_NAME);
}

function defaultConfig(): ConnectionConfig {
  const modeEnv = process.env.PRIMEHR_MODE as PrimeHrMode | undefined;
  // Packaged / first PC: Host by default. Client only when explicitly requested.
  const mode: PrimeHrMode = modeEnv === "client" ? "client" : "host";
  const hostUrl =
    process.env.PRIMEHR_HOST_URL ||
    (mode === "host" ? `http://127.0.0.1:${DEFAULT_PORT}` : "");
  return { mode, hostUrl };
}

function readConfig(): ConnectionConfig {
  try {
    const raw = fs.readFileSync(userDataConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as ConnectionConfig;
    if (parsed.mode === "host" || parsed.mode === "client") {
      return {
        mode: parsed.mode,
        hostUrl: parsed.hostUrl || defaultConfig().hostUrl,
      };
    }
  } catch {
    /* first run */
  }
  return defaultConfig();
}

function writeConfig(config: ConnectionConfig): void {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(userDataConfigPath(), JSON.stringify(config, null, 2), "utf8");
}

/** Persist Host default on first packaged launch so UI can skip setup. */
function ensureFirstRunHostConfig(): ConnectionConfig {
  const configPath = userDataConfigPath();
  if (!fs.existsSync(configPath)) {
    const cfg = defaultConfig();
    writeConfig(cfg);
    return cfg;
  }
  return readConfig();
}

/**
 * SQLite + uploads:
 * - Dev: project folder (.data/, uploads/)
 * - Packaged: %APPDATA%/PrimeHR Documents/primehr-data/
 */
function dataRoot(): string {
  if (!app.isPackaged) return path.resolve(process.cwd());
  const dir = path.join(app.getPath("userData"), "primehr-data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureDevPreload(): void {
  if (app.isPackaged) return;
  const outDir = path.join(appRoot(), "dist-electron");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "preload.js");
  fs.writeFileSync(
    out,
    `const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('primehr', {
  getConfig: () => ipcRenderer.invoke('primehr:get-config'),
  setConfig: (config) => ipcRenderer.invoke('primehr:set-config', config),
  getLocalIpHint: () => ipcRenderer.invoke('primehr:local-ips'),
  isPackaged: false,
  platform: process.platform,
});
`,
    "utf8",
  );
}

async function ensureHostStarted(config: ConnectionConfig): Promise<void> {
  if (config.mode !== "host") return;
  if (hostHandle) return;
  const { startHostServer } = await import("../server/index");
  hostHandle = await startHostServer({
    port: DEFAULT_PORT,
    baseDir: dataRoot(),
  });
}

function listLocalIps(): string[] {
  const nets = os.networkInterfaces();
  const out: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.family === "IPv4" && !e.internal) out.push(e.address);
    }
  }
  return out;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "PrimeHR Documents",
    backgroundColor: "#0f2744",
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexHtml = path.join(appRoot(), "dist", "index.html");
    if (!fs.existsSync(indexHtml)) {
      dialog.showErrorBox(
        "Lipsește UI-ul",
        `Nu găsesc ${indexHtml}. Rulați npm run build înainte de pornire.`,
      );
    }
    void mainWindow.loadURL(pathToFileURL(indexHtml).href);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle("primehr:get-config", () => readConfig());

  ipcMain.handle("primehr:set-config", async (_evt, next: ConnectionConfig) => {
    if (!next || (next.mode !== "host" && next.mode !== "client")) {
      throw new Error("Config invalid");
    }
    if (next.mode === "client" && !String(next.hostUrl || "").trim()) {
      throw new Error("URL host obligatoriu în modul client");
    }

    const normalized: ConnectionConfig = {
      mode: next.mode,
      hostUrl:
        next.mode === "host"
          ? `http://127.0.0.1:${DEFAULT_PORT}`
          : String(next.hostUrl).replace(/\/$/, ""),
    };
    writeConfig(normalized);

    if (normalized.mode === "host") {
      await ensureHostStarted(normalized);
    } else if (hostHandle) {
      await hostHandle.close();
      hostHandle = null;
    }
    return normalized;
  });

  ipcMain.handle("primehr:local-ips", () => listLocalIps());
}

app.whenReady().then(async () => {
  ensureDevPreload();
  registerIpc();

  // Packaged first PC: Host by default; SQLite+uploads under userData.
  const config = ensureFirstRunHostConfig();
  try {
    if (config.mode === "host") {
      await ensureHostStarted(config);
    }
  } catch (err) {
    console.error(err);
    dialog.showErrorBox(
      "Eroare host",
      `Nu am putut porni serverul local.\n${err instanceof Error ? err.message : String(err)}`,
    );
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void hostHandle?.close();
});
