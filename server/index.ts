import http from "node:http";
import path from "node:path";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { initDatabase } from "./db";
import { createRouter } from "./routes";
import { attachClient, setBroadcastServer } from "./broadcast";

const DEFAULT_PORT = Number(process.env.PRIMEHR_PORT || 3847);
const HOST = process.env.PRIMEHR_BIND || "0.0.0.0";

export interface HostServerHandle {
  port: number;
  close: () => Promise<void>;
}

export async function startHostServer(options?: {
  port?: number;
  baseDir?: string;
}): Promise<HostServerHandle> {
  const port = options?.port ?? DEFAULT_PORT;
  const baseDir = options?.baseDir ?? path.resolve(process.cwd());

  await initDatabase(baseDir);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", createRouter());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  setBroadcastServer(wss);

  wss.on("connection", (ws) => {
    attachClient(ws);
    ws.on("message", (raw) => {
      // ping/pong lightweight
      try {
        const msg = JSON.parse(String(raw));
        if (msg?.type === "ping") {
          ws.send(JSON.stringify({ event: "pong", payload: {}, at: new Date().toISOString() }));
        }
      } catch {
        /* ignore */
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, HOST, () => resolve());
    server.on("error", reject);
  });

  console.log(`[host] API + WebSocket pe http://${HOST}:${port} (ws path /ws)`);
  console.log(`[host] Date: ${path.join(baseDir, ".data")} | Upload: ${path.join(baseDir, "uploads")}`);

  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        wss.close();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("server/index.ts") ||
    process.argv[1].endsWith("server/index.js") ||
    process.argv[1].includes(`${path.sep}server${path.sep}index.`));

if (isDirectRun || process.env.PRIMEHR_FORCE_SERVER === "1") {
  startHostServer().catch((err) => {
    console.error("[host] Pornire eșuată:", err);
    process.exit(1);
  });
}
