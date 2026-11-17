/**
 * Smoke test fără UI: host, login, caz + upload, plus câteva apeluri IGM (igm1).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startHostServer } from "../server/index";

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "primehr-smoke-"));
  const handle = await startHostServer({ port: 3848, baseDir: tmp });
  const base = "http://127.0.0.1:3848/api";

  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin123!@#" }),
  }).then((r) => r.json());

  if (!login.token) throw new Error("login failed: " + JSON.stringify(login));
  const headers = {
    Authorization: `Bearer ${login.token}`,
    "Content-Type": "application/json",
  };

  const created = await fetch(`${base}/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Caz smoke test", status: "Nou" }),
  }).then((r) => r.json());

  if (!created.case?.id) throw new Error("create case failed");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "dot.png");
  const up = await fetch(`${base}/cases/${created.case.id}/files`, {
    method: "POST",
    headers: { Authorization: headers.Authorization },
    body: form,
  }).then((r) => r.json());
  if (!up.file?.id) throw new Error("upload failed: " + JSON.stringify(up));

  const login2 = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin123!@#" }),
  }).then((r) => r.json());

  const list = await fetch(`${base}/cases`, {
    headers: { Authorization: `Bearer ${login2.token}` },
  }).then((r) => r.json());

  const found = (list.cases || []).some((c: { id: string }) => c.id === created.case.id);
  if (!found) throw new Error("second client list missing case");

  // —— IGM ——
  const igmLogin = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "igm1", password: "Igm123!@#" }),
  }).then((r) => r.json());
  if (!igmLogin.token || igmLogin.user?.role !== "IGM") {
    throw new Error("igm1 login failed: " + JSON.stringify(igmLogin));
  }
  const igmHeaders = {
    Authorization: `Bearer ${igmLogin.token}`,
    "Content-Type": "application/json",
  };

  const company = await fetch(`${base}/igm/companies`, {
    method: "POST",
    headers: igmHeaders,
    body: JSON.stringify({ name: "Firma Smoke SRL" }),
  }).then((r) => r.json());
  if (!company.company?.id) throw new Error("igm company failed: " + JSON.stringify(company));

  const candidate = await fetch(`${base}/igm/candidates`, {
    method: "POST",
    headers: igmHeaders,
    body: JSON.stringify({
      firstName: "Ram",
      lastName: "Khatri",
      companyId: company.company.id,
      status: "Activ",
    }),
  }).then((r) => r.json());
  if (!candidate.candidate?.id) {
    throw new Error("igm candidate failed: " + JSON.stringify(candidate));
  }

  const issueDate = new Date().toISOString().slice(0, 10);
  const document = await fetch(`${base}/igm/documents`, {
    method: "POST",
    headers: igmHeaders,
    body: JSON.stringify({
      companyId: company.company.id,
      candidateId: candidate.candidate.id,
      type: "Invitatie",
      number: "INV-SMOKE-1",
      issueDate,
      alertDays: 30,
    }),
  }).then((r) => r.json());
  if (!document.document?.id) {
    throw new Error("igm document failed: " + JSON.stringify(document));
  }

  const igmData = await fetch(`${base}/igm/data`, {
    headers: { Authorization: igmHeaders.Authorization },
  }).then((r) => r.json());
  if (!igmData.companies?.length || !igmData.documents?.length) {
    throw new Error("igm data empty: " + JSON.stringify(igmData));
  }

  // Manager must not access IGM
  const mgr = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "manager1", password: "Manager123!@#" }),
  }).then((r) => r.json());
  const mgrBlocked = await fetch(`${base}/igm/data`, {
    headers: { Authorization: `Bearer ${mgr.token}` },
  });
  if (mgrBlocked.status !== 403) {
    throw new Error("manager should be blocked from IGM, got " + mgrBlocked.status);
  }

  console.log("SMOKE OK", {
    tmp,
    caseId: created.case.id,
    fileId: up.file.id,
    cases: list.cases.length,
    igmCompany: company.company.id,
    igmCandidate: candidate.candidate.id,
    igmDocument: document.document.id,
  });

  await handle.close();
}

main().catch((err) => {
  console.error("SMOKE FAIL", err);
  process.exit(1);
});
