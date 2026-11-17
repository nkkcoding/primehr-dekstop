const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(__dirname, "..", "dist-electron");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "preload.js"),
  `const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('primehr', {
  getConfig: () => ipcRenderer.invoke('primehr:get-config'),
  setConfig: (config) => ipcRenderer.invoke('primehr:set-config', config),
  getLocalIpHint: () => ipcRenderer.invoke('primehr:local-ips'),
  isPackaged: true,
  platform: process.platform,
});
`,
  "utf8",
);
console.log("[build] wrote dist-electron/preload.js");
