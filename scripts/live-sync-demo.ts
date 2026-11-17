/**
 * Demo: host + 2 „clienți” HTTP; client B primește WS la create de pe A.
 */
import { startHostServer } from "../server/index";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "primehr-live-"));
  const handle = await startHostServer({ port: 3849, baseDir: tmp });
  const base = "http://127.0.0.1:3849/api";

  const loginA = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin123!@#" }),
  }).then((r) => r.json());

  const loginB = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "manager1", password: "Manager123!@#" }),
  }).then((r) => r.json());

  const wsEvent = await new Promise<string>((resolve, reject) => {
    const ws = new WebSocket("ws://127.0.0.1:3849/ws");
    const t = setTimeout(() => reject(new Error("WS timeout")), 8000);
    ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      if (msg.event === "cases:changed") {
        clearTimeout(t);
        ws.close();
        resolve(JSON.stringify(msg.payload));
      }
    });
    ws.on("open", async () => {
      const created = await fetch(`${base}/cases`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${loginA.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Caz live sync", status: "În lucru" }),
      }).then((r) => r.json());
      if (!created.case) reject(new Error("create failed"));
    });
    ws.on("error", reject);
  });

  const listB = await fetch(`${base}/cases`, {
    headers: { Authorization: `Bearer ${loginB.token}` },
  }).then((r) => r.json());

  console.log("LIVE SYNC OK", {
    wsPayload: wsEvent,
    managerCases: listB.cases?.length ?? 0,
    note: "Manager vede doar cazurile proprii; WS tot a notificat clientul B",
  });

  await handle.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
