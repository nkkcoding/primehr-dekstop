/// <reference types="vite/client" />

export type PrimeHrMode = "host" | "client";

export interface ConnectionConfig {
  mode: PrimeHrMode;
  hostUrl: string;
}

export interface PrimeHrBridge {
  getConfig: () => Promise<ConnectionConfig>;
  setConfig: (config: ConnectionConfig) => Promise<ConnectionConfig>;
  getLocalIpHint: () => Promise<string[]>;
  /** True in packaged Electron (.exe); false/undefined in browser / electron-dev. */
  isPackaged?: boolean;
  platform: string;
}

declare global {
  interface Window {
    primehr?: PrimeHrBridge;
  }
}

export {};
