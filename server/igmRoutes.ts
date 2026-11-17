import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { getUserByToken, type SessionUser } from "./auth";
import { getDb, getUploadsDir } from "./db";
import { broadcast } from "./broadcast";
import {
  IgmError,
  PICKUP_ITEM_TYPES,
  SUBMISSION_TYPES,
  companyKey,
  documentFields,
  findCandidate,
  findCompany,
  findDocument,
  igmId,
  igmDate,
  igmRequired,
  igmText,
  loadIgmBundle,
  requireActiveCompany,
  requireCandidate,
  requireCompany,
  requireIgmAccess,
  resolveCandidateId,
  resolveCompanyId,
  stampNow,
  submissionStatus,
  writeAudit,
} from "./igm";

type AuthedRequest = Request & { user?: SessionUser; token?: string };

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const fromQuery = typeof req.query.token === "string" ? req.query.token : null;
  return fromQuery;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  const user = getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: "Neautentificat" });
    return;
  }
  req.user = user;
  req.token = token ?? undefined;
  next();
}

const ALLOWED_MIME = new Set(["application/pdf", "image/png"]);
const ALLOWED_EXT = new Set([".pdf", ".png"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadsDir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `igm-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
      cb(new Error("Doar fișiere PDF sau PNG sunt acceptate"));
      return;
    }
    cb(null, true);
  },
});

function notifyIgm(action: string, payload: unknown = {}): void {
  broadcast("igm:changed", { action, ...((payload as object) || {}) });
}

function igmGuard(req: AuthedRequest, _res: Response, next: NextFunction): void {
  try {
    requireIgmAccess(req.user!);
    next();
  } catch (err) {
    handleIgmError(_res, err);
  }
}

function handleIgmError(res: Response, err: unknown): void {
  if (err instanceof IgmError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof Error && err.message) {
    console.error(err);
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Eroare internă IGM" });
}

export function createIgmRouter(): Router {
  const router = Router();
  router.use(requireAuth, igmGuard);

  router.get("/data", (_req, res) => {
    try {
      res.json(loadIgmBundle());
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/companies", (req: AuthedRequest, res) => {
    try {
      const name = igmRequired(req.body?.name, 120);
      const db = getDb();
      const dup = db
        .prepare("SELECT * FROM igm_companies")
        .all()
        .some((c) => companyKey(String((c as { name: string }).name)) === companyKey(name));
      if (dup) throw new IgmError("Compania există deja (poate fi arhivată).");
      const id = igmId("CMP");
      const createdAt = stampNow();
      db.prepare(
        `INSERT INTO igm_companies (id, name, created_at, deleted_at) VALUES (?, ?, ?, '')`,
      ).run(id, name, createdAt);
      const row = { id, name, createdAt, deletedAt: "" };
      notifyIgm("company_created", { company: row });
      res.status(201).json({ company: row });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.patch("/companies/:id", (req: AuthedRequest, res) => {
    try {
      const c = findCompany(req.params.id);
      if (!c || c.deleted_at) throw new IgmError("Companie indisponibilă.");
      const name = igmRequired(req.body?.name, 120);
      const dup = getDb()
        .prepare("SELECT * FROM igm_companies")
        .all()
        .some(
          (x) =>
            String((x as { id: string }).id) !== req.params.id &&
            companyKey(String((x as { name: string }).name)) === companyKey(name),
        );
      if (dup) throw new IgmError("Nume deja existent.");
      getDb().prepare("UPDATE igm_companies SET name = ? WHERE id = ?").run(name, req.params.id);
      const out = { ...mapCompanyRow({ ...c, name }), name };
      writeAudit("companies", req.params.id, "UPDATE", mapCompanyRow(c), out, req.user!);
      notifyIgm("company_updated", { company: out });
      res.json({ company: out });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/candidates", (req: AuthedRequest, res) => {
    try {
      const companyId = String(req.body?.companyId || "").trim();
      if (companyId) requireCompany(companyId);
      const id = igmId("CND");
      const createdAt = stampNow();
      const firstName = igmRequired(req.body?.firstName, 100);
      const lastName = igmRequired(req.body?.lastName, 100);
      const status = igmText(req.body?.status || (companyId ? "Activ" : "În procesare"), 40);
      const notes = igmText(req.body?.notes, 1000);
      getDb()
        .prepare(
          `INSERT INTO igm_candidates
           (id, first_name, last_name, company_id, status, notes, created_at, deleted_at, archive_reason, last_work_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '')`,
        )
        .run(id, firstName, lastName, companyId, status, notes, createdAt);
      const row = {
        id,
        firstName,
        lastName,
        companyId,
        status,
        notes,
        createdAt,
        deletedAt: "",
        archiveReason: "",
        lastWorkDate: "",
      };
      notifyIgm("candidate_created", { candidate: row });
      res.status(201).json({ candidate: row });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.patch("/candidates/:id", (req: AuthedRequest, res) => {
    try {
      const c = requireCandidate(req.params.id);
      if (c.deleted_at) throw new IgmError("Candidatul este arhivat.");
      if (String(req.body?.companyId || "") !== String(c.company_id || "")) {
        throw new IgmError("Pentru schimbarea companiei folosește Schimbări candidați.");
      }
      const firstName = igmRequired(req.body?.firstName, 100);
      const lastName = igmRequired(req.body?.lastName, 100);
      const status = igmRequired(req.body?.status, 40);
      const notes = igmText(req.body?.notes, 1000);
      getDb()
        .prepare(
          `UPDATE igm_candidates SET first_name = ?, last_name = ?, status = ?, notes = ? WHERE id = ?`,
        )
        .run(firstName, lastName, status, notes, req.params.id);
      const out = {
        id: req.params.id,
        firstName,
        lastName,
        companyId: c.company_id || "",
        status,
        notes,
        createdAt: c.created_at,
        deletedAt: "",
        archiveReason: "",
        lastWorkDate: "",
      };
      notifyIgm("candidate_updated", { candidate: out });
      res.json({ candidate: out });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/candidates/:id/archive", (req: AuthedRequest, res) => {
    try {
      const c = requireCandidate(req.params.id);
      if (c.deleted_at) throw new IgmError("Deja arhivat.");
      const reason = igmRequired(req.body?.reason, 500);
      const lastWorkDate = igmDate(req.body?.lastWorkDate);
      const deletedAt = stampNow();
      getDb()
        .prepare(
          `UPDATE igm_candidates SET deleted_at = ?, archive_reason = ?, last_work_date = ? WHERE id = ?`,
        )
        .run(deletedAt, reason, lastWorkDate, req.params.id);
      const out = {
        ...mapCandidateRow(c),
        deletedAt,
        archiveReason: reason,
        lastWorkDate,
      };
      writeAudit("candidates", req.params.id, "ARCHIVE", mapCandidateRow(c), out, req.user!);
      notifyIgm("candidate_archived", { candidate: out });
      res.json({ candidate: out });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/candidates/:id/restore", (req: AuthedRequest, res) => {
    try {
      const c = requireCandidate(req.params.id);
      if (!c.deleted_at) throw new IgmError("Candidatul nu este arhivat.");
      getDb()
        .prepare(
          `UPDATE igm_candidates SET deleted_at = '', archive_reason = '', last_work_date = '' WHERE id = ?`,
        )
        .run(req.params.id);
      const out = { ...mapCandidateRow(c), deletedAt: "", archiveReason: "", lastWorkDate: "" };
      writeAudit("candidates", req.params.id, "RESTORE", mapCandidateRow(c), out, req.user!);
      notifyIgm("candidate_restored", { candidate: out });
      res.json({ candidate: out });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/transfers", (req: AuthedRequest, res) => {
    try {
      const candidateId = String(req.body?.candidateId || "").trim();
      const to = String(req.body?.toCompanyId || "").trim();
      requireActiveCompany(to);
      const effectiveDate = igmDate(req.body?.effectiveDate);
      const notes = igmText(req.body?.notes, 1000);
      const c = requireCandidate(candidateId);
      if (c.deleted_at) throw new IgmError("Candidatul este arhivat.");
      const from = String(c.company_id || "");
      if (from === to) throw new IgmError("Candidatul este deja la această companie.");
      const id = igmId("TRF");
      const createdAt = stampNow();
      const changedBy = igmText(req.user!.username || req.user!.displayName || req.user!.role, 100);
      const db = getDb();
      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO igm_transfers
           (id, candidate_id, from_company_id, to_company_id, effective_date, notes, changed_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, candidateId, from, to, effectiveDate, notes, changedBy, createdAt);
        db.prepare("UPDATE igm_candidates SET company_id = ? WHERE id = ?").run(to, candidateId);
      });
      tx();
      const entry = {
        id,
        candidateId,
        fromCompanyId: from,
        toCompanyId: to,
        effectiveDate,
        notes,
        changedBy,
        createdAt,
      };
      notifyIgm("transfer_created", { transfer: entry });
      res.status(201).json({ transfer: entry });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/documents", (req: AuthedRequest, res) => {
    try {
      const companyId = resolveCompanyId(req.body || {});
      const candidateId = resolveCandidateId(req.body || {}, companyId);
      const c = requireCandidate(candidateId);
      const clean = documentFields(req.body || {});
      const id = igmId("DOC");
      const createdAt = stampNow();
      const finalCompany = companyId || String(c.company_id || "");
      getDb()
        .prepare(
          `INSERT INTO igm_documents
           (id, candidate_id, company_id, type, number, issue_date, expiry_date, alert_days, notes,
            created_at, tracking_number, sent_date, delivery_date, deleted_at, batch_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')`,
        )
        .run(
          id,
          candidateId,
          finalCompany,
          clean.type,
          clean.number,
          clean.issueDate,
          clean.expiryDate,
          String(clean.alertDays),
          clean.notes,
          createdAt,
          clean.trackingNumber,
          clean.sentDate,
          clean.deliveryDate,
        );
      const o = {
        id,
        candidateId,
        companyId: finalCompany,
        ...clean,
        alertDays: String(clean.alertDays),
        createdAt,
        deletedAt: "",
        batchId: "",
      };
      writeAudit("documents", id, "CREATE", {}, o, req.user!);
      notifyIgm("document_created", { document: o });
      res.status(201).json({ document: o });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.patch("/documents/:id", (req: AuthedRequest, res) => {
    try {
      const old = findDocument(req.params.id);
      if (!old || old.deleted_at) throw new IgmError("Document inexistent/arhivat.");
      const clean = documentFields({ ...req.body, type: req.body?.type || old.type });
      getDb()
        .prepare(
          `UPDATE igm_documents SET type = ?, number = ?, issue_date = ?, expiry_date = ?, alert_days = ?,
           notes = ?, tracking_number = ?, sent_date = ?, delivery_date = ? WHERE id = ?`,
        )
        .run(
          clean.type,
          clean.number,
          clean.issueDate,
          clean.expiryDate,
          String(clean.alertDays),
          clean.notes,
          clean.trackingNumber,
          clean.sentDate,
          clean.deliveryDate,
          req.params.id,
        );
      const out = {
        id: req.params.id,
        candidateId: old.candidate_id,
        companyId: old.company_id || "",
        ...clean,
        alertDays: String(clean.alertDays),
        createdAt: old.created_at,
        deletedAt: "",
        batchId: old.batch_id || "",
      };
      writeAudit("documents", req.params.id, "UPDATE", mapDocumentRow(old), out, req.user!);
      notifyIgm("document_updated", { document: out });
      res.json({ document: out });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/documents/cazier-batch", (req: AuthedRequest, res) => {
    try {
      const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
      if (!groups.length || groups.length > 30) throw new IgmError("Adaugă 1–30 companii.");
      let total = 0;
      for (const g of groups) {
        if (!Array.isArray(g.people) || !g.people.length) {
          throw new IgmError("Adaugă candidați la fiecare companie.");
        }
        total += g.people.length;
      }
      if (total > 200) throw new IgmError("Maximum 200 caziere într-un lot.");

      const batchId = igmId("LOT");
      const out: unknown[] = [];
      const db = getDb();
      const tx = db.transaction(() => {
        for (const g of groups) {
          const companyId = resolveCompanyId(g);
          for (const person of g.people) {
            const candidateId = resolveCandidateId(person, companyId);
            const clean = documentFields({
              ...person,
              type: "Cazier",
              issueDate: req.body?.issueDate,
              expiryDate: req.body?.expiryDate,
              alertDays: req.body?.alertDays,
              notes: req.body?.notes,
            });
            const id = igmId("DOC");
            const createdAt = stampNow();
            db.prepare(
              `INSERT INTO igm_documents
               (id, candidate_id, company_id, type, number, issue_date, expiry_date, alert_days, notes,
                created_at, tracking_number, sent_date, delivery_date, deleted_at, batch_id)
               VALUES (?, ?, ?, 'Cazier', ?, ?, ?, ?, ?, ?, '', '', '', '', ?)`,
            ).run(
              id,
              candidateId,
              companyId,
              clean.number,
              clean.issueDate,
              clean.expiryDate,
              String(clean.alertDays),
              clean.notes,
              createdAt,
              batchId,
            );
            out.push({
              id,
              candidateId,
              companyId,
              type: "Cazier",
              number: clean.number,
              issueDate: clean.issueDate,
              expiryDate: clean.expiryDate,
              alertDays: String(clean.alertDays),
              notes: clean.notes,
              createdAt,
              trackingNumber: "",
              sentDate: "",
              deliveryDate: "",
              deletedAt: "",
              batchId,
            });
          }
        }
        writeAudit("documents", batchId, "BATCH_CREATE", {}, { count: out.length }, req.user!);
      });
      tx();
      notifyIgm("cazier_batch", { batchId, count: out.length });
      res.status(201).json({ batchId, count: out.length, documents: out });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/submissions", (req: AuthedRequest, res) => {
    try {
      const type = String(req.body?.type || "");
      if (!(SUBMISSION_TYPES as readonly string[]).includes(type)) {
        throw new IgmError("Tip dosar invalid.");
      }
      const scheduledDate = req.body?.scheduledDate ? igmDate(req.body.scheduledDate) : "";
      const date = req.body?.date ? igmDate(req.body.date) : "";
      const status = submissionStatus(
        String(req.body?.status || (date ? "Depus" : "Programat")),
      );
      if (status === "Depus" && !date) throw new IgmError("Completează data depunerii efective.");
      if (status === "Programat" && !scheduledDate) {
        throw new IgmError("Completează data programării.");
      }
      const companyId = resolveCompanyId(req.body || {});
      const candidateId = resolveCandidateId(req.body || {}, companyId);
      const id = igmId("DEP");
      const createdAt = stampNow();
      const number = igmText(req.body?.number, 100);
      const notes = igmText(req.body?.notes, 1000);
      getDb()
        .prepare(
          `INSERT INTO igm_submissions
           (id, candidate_id, company_id, type, number, date, notes, created_at, scheduled_date, status, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
        )
        .run(id, candidateId, companyId, type, number, date, notes, createdAt, scheduledDate, status);
      const o = {
        id,
        candidateId,
        companyId,
        type,
        number,
        date,
        notes,
        createdAt,
        scheduledDate,
        status,
        deletedAt: "",
      };
      writeAudit("submissions", id, "CREATE", {}, o, req.user!);
      notifyIgm("submission_created", { submission: o });
      res.status(201).json({ submission: o });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.patch("/submissions/:id", (req: AuthedRequest, res) => {
    try {
      const old = getDb()
        .prepare("SELECT * FROM igm_submissions WHERE id = ?")
        .get(req.params.id) as Record<string, unknown> | undefined;
      if (!old || old.deleted_at) throw new IgmError("Dosar indisponibil.");
      const status = submissionStatus(String(req.body?.status));
      const scheduledDate = req.body?.scheduledDate ? igmDate(req.body.scheduledDate) : "";
      const date = req.body?.date ? igmDate(req.body.date) : "";
      if (status === "Depus" && !date) throw new IgmError("Completează data depunerii.");
      if (status === "Programat" && !scheduledDate) {
        throw new IgmError("Completează programarea.");
      }
      const type = String(req.body?.type || "");
      if (!(SUBMISSION_TYPES as readonly string[]).includes(type)) {
        throw new IgmError("Tip dosar invalid.");
      }
      const number = igmText(req.body?.number, 100);
      const notes = igmText(req.body?.notes, 1000);
      getDb()
        .prepare(
          `UPDATE igm_submissions SET type = ?, number = ?, date = ?, scheduled_date = ?, status = ?, notes = ? WHERE id = ?`,
        )
        .run(type, number, date, scheduledDate, status, notes, req.params.id);
      const out = {
        id: req.params.id,
        candidateId: old.candidate_id || "",
        companyId: old.company_id || "",
        type,
        number,
        date,
        notes,
        createdAt: old.created_at,
        scheduledDate,
        status,
        deletedAt: "",
      };
      writeAudit("submissions", req.params.id, "UPDATE", mapSubmissionRow(old), out, req.user!);
      notifyIgm("submission_updated", { submission: out });
      res.json({ submission: out });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/pickups", (req: AuthedRequest, res) => {
    try {
      requireActiveCompany(String(req.body?.companyId || ""));
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length || items.length > 20) {
        throw new IgmError("Adaugă cel puțin un tip de document.");
      }
      for (const x of items) {
        if (
          !(PICKUP_ITEM_TYPES as readonly string[]).includes(x.type) ||
          !Number.isInteger(Number(x.quantity)) ||
          Number(x.quantity) < 1 ||
          Number(x.quantity) > 10000
        ) {
          throw new IgmError("Tip sau cantitate invalidă.");
        }
      }
      const id = igmId("RID");
      const createdAt = stampNow();
      const date = igmDate(req.body?.date);
      const notes = igmText(req.body?.notes, 1000);
      const companyId = String(req.body.companyId);
      const db = getDb();
      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO igm_pickups (id, company_id, date, notes, created_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, '')`,
        ).run(id, companyId, date, notes, createdAt);
        for (const x of items) {
          db.prepare(
            `INSERT INTO igm_pickup_items (id, pickup_id, type, quantity, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          ).run(igmId("ITEM"), id, x.type, Number(x.quantity), stampNow());
        }
      });
      tx();
      const pickup = { id, companyId, date, notes, createdAt, deletedAt: "" };
      notifyIgm("pickup_created", { pickup });
      res.status(201).json({ pickup });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.patch("/pickups/:id", (req: AuthedRequest, res) => {
    try {
      const old = getDb()
        .prepare("SELECT * FROM igm_pickups WHERE id = ?")
        .get(req.params.id) as Record<string, unknown> | undefined;
      if (!old || old.deleted_at) throw new IgmError("Ridicare indisponibilă.");
      const date = igmDate(req.body?.date);
      const notes = igmText(req.body?.notes, 1000);
      getDb()
        .prepare("UPDATE igm_pickups SET date = ?, notes = ? WHERE id = ?")
        .run(date, notes, req.params.id);
      const out = {
        id: req.params.id,
        companyId: old.company_id,
        date,
        notes,
        createdAt: old.created_at,
        deletedAt: "",
      };
      writeAudit("pickups", req.params.id, "UPDATE", mapPickupRow(old), out, req.user!);
      notifyIgm("pickup_updated", { pickup: out });
      res.json({ pickup: out });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/soft-delete", (req: AuthedRequest, res) => {
    try {
      const table = String(req.body?.table || "");
      const id = String(req.body?.id || "");
      const reason = igmRequired(req.body?.reason, 500);
      if (!["documents", "submissions", "pickups", "companies"].includes(table)) {
        throw new IgmError("Tip invalid.");
      }
      const tableMap: Record<string, string> = {
        documents: "igm_documents",
        submissions: "igm_submissions",
        pickups: "igm_pickups",
        companies: "igm_companies",
      };
      const sqlTable = tableMap[table];
      const old = getDb().prepare(`SELECT * FROM ${sqlTable} WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      if (!old || old.deleted_at) throw new IgmError("Înregistrarea nu este activă.");
      if (table === "companies") {
        const activeCand = getDb()
          .prepare(
            `SELECT COUNT(*) AS c FROM igm_candidates WHERE company_id = ? AND deleted_at = ''`,
          )
          .get(id) as { c: number };
        if (Number(activeCand.c) > 0) {
          throw new IgmError("Transferă sau arhivează mai întâi candidații.");
        }
      }
      const deletedAt = stampNow();
      getDb().prepare(`UPDATE ${sqlTable} SET deleted_at = ? WHERE id = ?`).run(deletedAt, id);
      const out = { ...old, deleted_at: deletedAt };
      writeAudit(table, id, "ARCHIVE: " + reason, old, out, req.user!);
      notifyIgm("soft_deleted", { table, id });
      res.json({ ok: true, deletedAt });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post("/mark-seen", (req: AuthedRequest, res) => {
    try {
      const category = String(req.body?.category || "");
      if (!["alerts", "archived"].includes(category)) throw new IgmError("Categorie invalidă.");
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (items.length > 5000) throw new IgmError("Listă invalidă.");

      const records =
        category === "alerts"
          ? (getDb().prepare("SELECT * FROM igm_documents").all() as Record<string, unknown>[])
          : (getDb().prepare("SELECT * FROM igm_candidates").all() as Record<string, unknown>[]);

      const oldAck = new Set(
        (getDb().prepare("SELECT * FROM igm_acknowledgements").all() as Record<string, unknown>[])
          .filter((x) => x.category === category)
          .map((x) => `${x.record_id}|${x.fingerprint}`),
      );

      let marked = 0;
      const createdAt = stampNow();
      const actor = String(req.user!.username || req.user!.displayName || req.user!.role || "IGM");
      const db = getDb();
      const tx = db.transaction(() => {
        for (const item of items) {
          const id = String(item?.id || "");
          const r = records.find((x) => String(x.id) === id);
          if (!r) continue;
          if (category === "alerts") {
            if (r.deleted_at || r.type === "Pasaport Nepal" || !r.expiry_date) continue;
          } else if (!r.deleted_at) {
            continue;
          }
          const fp =
            category === "alerts"
              ? [r.expiry_date, r.type, r.alert_days].join("|")
              : String(r.deleted_at);
          if (fp !== String(item.fingerprint || "") || oldAck.has(id + "|" + fp)) continue;
          oldAck.add(id + "|" + fp);
          db.prepare(
            `INSERT INTO igm_acknowledgements (id, category, record_id, fingerprint, actor, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).run(igmId("ACK"), category, id, fp, actor, createdAt);
          marked += 1;
        }
      });
      tx();
      notifyIgm("mark_seen", { category, marked });
      res.json({ marked });
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  router.post(
    "/documents/:id/files",
    (req: AuthedRequest, res, next) => {
      upload.single("file")(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err.message || "Upload eșuat" });
          return;
        }
        next();
      });
    },
    (req: AuthedRequest, res) => {
      try {
        const doc = findDocument(req.params.id);
        if (!doc || doc.deleted_at) {
          if (req.file) fs.unlinkSync(req.file.path);
          throw new IgmError("Document inexistent/arhivat.");
        }
        if (!req.file) throw new IgmError("Fișier lipsă.");
        const info = getDb()
          .prepare(
            `INSERT INTO igm_files (document_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            String(doc.id),
            req.file.originalname,
            req.file.filename,
            req.file.mimetype,
            req.file.size,
            req.user!.id,
          );
        const file = getDb()
          .prepare("SELECT * FROM igm_files WHERE id = ?")
          .get(Number(info.lastInsertRowid)) as Record<string, unknown>;
        const mapped = {
          id: file.id,
          documentId: file.document_id,
          originalName: file.original_name,
          storedName: file.stored_name,
          mimeType: file.mime_type,
          sizeBytes: file.size_bytes,
          uploadedBy: file.uploaded_by,
          createdAt: file.created_at,
        };
        notifyIgm("file_uploaded", { file: mapped });
        res.status(201).json({ file: mapped });
      } catch (err) {
        handleIgmError(res, err);
      }
    },
  );

  router.get("/files/:id/download", (req: AuthedRequest, res) => {
    try {
      const file = getDb()
        .prepare("SELECT * FROM igm_files WHERE id = ?")
        .get(req.params.id) as Record<string, unknown> | undefined;
      if (!file) throw new IgmError("Fișier inexistent.", 404);
      const full = path.join(getUploadsDir(), String(file.stored_name));
      if (!fs.existsSync(full)) throw new IgmError("Fișier lipsă pe disc.", 404);
      res.download(full, String(file.original_name));
    } catch (err) {
      handleIgmError(res, err);
    }
  });

  return router;
}

function mapCompanyRow(c: Record<string, unknown>) {
  return {
    id: c.id,
    name: c.name,
    createdAt: c.created_at,
    deletedAt: c.deleted_at || "",
  };
}

function mapCandidateRow(c: Record<string, unknown>) {
  return {
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    companyId: c.company_id || "",
    status: c.status,
    notes: c.notes || "",
    createdAt: c.created_at,
    deletedAt: c.deleted_at || "",
    archiveReason: c.archive_reason || "",
    lastWorkDate: c.last_work_date || "",
  };
}

function mapDocumentRow(d: Record<string, unknown>) {
  return {
    id: d.id,
    candidateId: d.candidate_id,
    companyId: d.company_id || "",
    type: d.type,
    number: d.number || "",
    issueDate: d.issue_date || "",
    expiryDate: d.expiry_date || "",
    alertDays: d.alert_days === null || d.alert_days === "" ? "" : String(d.alert_days),
    notes: d.notes || "",
    createdAt: d.created_at,
    trackingNumber: d.tracking_number || "",
    sentDate: d.sent_date || "",
    deliveryDate: d.delivery_date || "",
    deletedAt: d.deleted_at || "",
    batchId: d.batch_id || "",
  };
}

function mapSubmissionRow(s: Record<string, unknown>) {
  return {
    id: s.id,
    candidateId: s.candidate_id || "",
    companyId: s.company_id || "",
    type: s.type,
    number: s.number || "",
    date: s.date || "",
    notes: s.notes || "",
    createdAt: s.created_at,
    scheduledDate: s.scheduled_date || "",
    status: s.status,
    deletedAt: s.deleted_at || "",
  };
}

function mapPickupRow(p: Record<string, unknown>) {
  return {
    id: p.id,
    companyId: p.company_id,
    date: p.date,
    notes: p.notes || "",
    createdAt: p.created_at,
    deletedAt: p.deleted_at || "",
  };
}
