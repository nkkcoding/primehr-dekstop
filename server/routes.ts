import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
  AuthError,
  changePassword,
  getUserByToken,
  login,
  logout,
  type SessionUser,
} from "./auth";
import { getDb, getUploadsDir, nextCaseId, type CaseRow, type FileRow } from "./db";
import { broadcast } from "./broadcast";
import { createIgmRouter } from "./igmRoutes";

export type AuthedRequest = Request & { user?: SessionUser; token?: string };

const ALLOWED_MIME = new Set(["application/pdf", "image/png"]);
const ALLOWED_EXT = new Set([".pdf", ".png"]);

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const fromQuery = typeof req.query.token === "string" ? req.query.token : null;
  return fromQuery;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
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

function canSeeAllCases(role: string): boolean {
  return role === "ADMIN" || role === "CEO";
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadsDir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
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

export function createRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, mode: "host", service: "primehr-desktop" });
  });

  router.post("/auth/login", (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      if (!username || !password) {
        res.status(400).json({ error: "Username și parolă sunt obligatorii" });
        return;
      }
      const result = login(String(username), String(password));
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post("/auth/logout", requireAuth, (req: AuthedRequest, res) => {
    if (req.token) logout(req.token);
    res.json({ ok: true });
  });

  router.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  router.post("/auth/change-password", requireAuth, (req: AuthedRequest, res) => {
    try {
      const { currentPassword, newPassword } = req.body ?? {};
      const force = Boolean(req.user?.mustChangePassword);
      const user = changePassword(
        req.user!.id,
        force ? null : currentPassword ?? null,
        String(newPassword ?? ""),
        force,
      );
      res.json({ user });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get("/cases", requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    let rows: CaseRow[];
    if (canSeeAllCases(req.user!.role)) {
      rows = db
        .prepare("SELECT * FROM cases ORDER BY updated_at DESC, id DESC")
        .all() as CaseRow[];
    } else if (req.user!.role === "MANAGER") {
      rows = db
        .prepare(
          "SELECT * FROM cases WHERE created_by = ? ORDER BY updated_at DESC, id DESC",
        )
        .all(req.user!.id) as CaseRow[];
    } else {
      // IGM: stub — no case module yet
      rows = [];
    }
    res.json({ cases: rows });
  });

  router.post("/cases", requireAuth, (req: AuthedRequest, res) => {
    try {
      if (req.user!.role === "IGM") {
        res.status(403).json({ error: "Rolul IGM nu creează cazuri în acest scaffold" });
        return;
      }
      const title = String(req.body?.title ?? "").trim();
      const status = String(req.body?.status ?? "Nou").trim() || "Nou";
      if (!title) {
        res.status(400).json({ error: "Titlul cazului este obligatoriu" });
        return;
      }

      const id = nextCaseId();
      const db = getDb();
      db.prepare(
        `INSERT INTO cases (id, title, status, created_by) VALUES (?, ?, ?, ?)`,
      ).run(id, title, status, req.user!.id);

      const created = db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as CaseRow;
      broadcast("cases:changed", { action: "created", case: created });
      res.status(201).json({ case: created });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get("/cases/:id", requireAuth, (req: AuthedRequest, res) => {
    const row = getDb().prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id) as
      | CaseRow
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Caz inexistent" });
      return;
    }
    if (!canAccessCase(req.user!, row)) {
      res.status(403).json({ error: "Acces interzis la acest caz" });
      return;
    }
    const files = getDb()
      .prepare("SELECT * FROM case_files WHERE case_id = ? ORDER BY created_at DESC")
      .all(row.id) as FileRow[];
    res.json({ case: row, files });
  });

  router.get("/cases/:id/files", requireAuth, (req: AuthedRequest, res) => {
    const row = getDb().prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id) as
      | CaseRow
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Caz inexistent" });
      return;
    }
    if (!canAccessCase(req.user!, row)) {
      res.status(403).json({ error: "Acces interzis" });
      return;
    }
    const files = getDb()
      .prepare("SELECT * FROM case_files WHERE case_id = ? ORDER BY created_at DESC")
      .all(row.id) as FileRow[];
    res.json({ files });
  });

  router.post(
    "/cases/:id/files",
    requireAuth,
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
        const caseRow = getDb().prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id) as
          | CaseRow
          | undefined;
        if (!caseRow) {
          if (req.file) fs.unlinkSync(req.file.path);
          res.status(404).json({ error: "Caz inexistent" });
          return;
        }
        if (!canAccessCase(req.user!, caseRow)) {
          if (req.file) fs.unlinkSync(req.file.path);
          res.status(403).json({ error: "Acces interzis" });
          return;
        }
        if (!req.file) {
          res.status(400).json({ error: "Fișier lipsă" });
          return;
        }

        const info = getDb()
          .prepare(
            `INSERT INTO case_files (case_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            caseRow.id,
            req.file.originalname,
            req.file.filename,
            req.file.mimetype,
            req.file.size,
            req.user!.id,
          );

        getDb()
          .prepare("UPDATE cases SET updated_at = datetime('now') WHERE id = ?")
          .run(caseRow.id);

        const file = getDb()
          .prepare("SELECT * FROM case_files WHERE id = ?")
          .get(Number(info.lastInsertRowid)) as FileRow;

        broadcast("cases:changed", { action: "file_uploaded", caseId: caseRow.id, file });
        res.status(201).json({ file });
      } catch (err) {
        handleError(res, err);
      }
    },
  );

  router.get("/files/:id/download", requireAuth, (req: AuthedRequest, res) => {
    const file = getDb().prepare("SELECT * FROM case_files WHERE id = ?").get(req.params.id) as
      | FileRow
      | undefined;
    if (!file) {
      res.status(404).json({ error: "Fișier inexistent" });
      return;
    }
    const caseRow = getDb().prepare("SELECT * FROM cases WHERE id = ?").get(file.case_id) as CaseRow;
    if (!canAccessCase(req.user!, caseRow)) {
      res.status(403).json({ error: "Acces interzis" });
      return;
    }
    const full = path.join(getUploadsDir(), file.stored_name);
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: "Fișier lipsă pe disc" });
      return;
    }
    res.download(full, file.original_name);
  });

  router.get("/nav", requireAuth, (req: AuthedRequest, res) => {
    res.json({ items: navForRole(req.user!.role) });
  });

  router.use("/igm", createIgmRouter());

  return router;
}

function canAccessCase(user: SessionUser, row: CaseRow): boolean {
  if (canSeeAllCases(user.role)) return true;
  if (user.role === "MANAGER") return row.created_by === user.id;
  return false;
}

function navForRole(role: string): { id: string; label: string; path: string; enabled: boolean }[] {
  switch (role) {
    case "ADMIN":
      return [
        { id: "igm", label: "Documente & IGM", path: "/app/igm", enabled: true },
        { id: "cases", label: "Cazuri", path: "/app/cazuri", enabled: true },
        { id: "ceo", label: "CEO (stub)", path: "/app/ceo", enabled: false },
        { id: "users", label: "Utilizatori (stub)", path: "/app/utilizatori", enabled: false },
      ];
    case "CEO":
      return [
        { id: "igm", label: "Documente & IGM", path: "/app/igm", enabled: true },
        { id: "cases", label: "Cazuri", path: "/app/cazuri", enabled: true },
        { id: "ceo", label: "CEO (stub)", path: "/app/ceo", enabled: false },
      ];
    case "MANAGER":
      return [
        { id: "cases", label: "Cazuri", path: "/app/cazuri", enabled: true },
        { id: "dashboard", label: "Dashboard", path: "/app", enabled: true },
      ];
    case "IGM":
      return [{ id: "igm", label: "Documente & IGM", path: "/app/igm", enabled: true }];
    default:
      return [];
  }
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Eroare internă" });
}
