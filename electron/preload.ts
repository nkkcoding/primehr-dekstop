import { contextBridge, ipcRenderer } from "electron";

export type PrimeHrMode = "host" | "client";

export interface ConnectionConfig {
  mode: PrimeHrMode;
  hostUrl: string;
}

contextBridge.exposeInMainWorld("primehr", {
  getConfig: (): Promise<ConnectionConfig> => ipcRenderer.invoke("primehr:get-config"),
  setConfig: (config: ConnectionConfig): Promise<ConnectionConfig> =>
    ipcRenderer.invoke("primehr:set-config", config),
  getLocalIpHint: (): Promise<string[]> => ipcRenderer.invoke("primehr:local-ips"),
  isPackaged: true,
  platform: process.platform,
});
