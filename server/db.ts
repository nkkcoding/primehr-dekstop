/**
 * Persistence via sql.js (SQLite compiled to WASM/JS) — no native compile,
 * no Python / Visual Studio Build Tools on Windows.
 *
 * Exposes a small better-sqlite3-like surface (prepare/get/all/run/exec/transaction)
 * so auth/routes stay unchanged. DB file: `.data/primehr.db` (exported binary).
 * Mutating statements persist to disk; nested transactions flush once on COMMIT.
 */
import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from "sql.js";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";

export type Role = "ADMIN" | "MANAGER" | "CEO" | "IGM";

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  password_hash: string;
  must_change_password: number;
  active: number;
  created_at: string;
}

export interface CaseRow {
  id: string;
  title: string;
  status: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface FileRow {
  id: number;
  case_id: string;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: number;
  created_at: string;
}

export interface RunResult {
  lastInsertRowid: number | bigint;
  changes: number;
}

type BindParam = SqlValue | BindParam[] | Record<string, SqlValue>;

/** Minimal better-sqlite3-compatible handle used by auth/routes. */
export interface AppDatabase {
  prepare(sql: string): AppStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
}

export interface AppStatement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(...params: BindParam[]): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all(...params: BindParam[]): any[];
  run(...params: BindParam[]): RunResult;
}

let rawDb: SqlJsDatabase | null = null;
let appDb: AppDatabase | null = null;
let dataDir = "";
let uploadsDir = "";
let dbPath = "";
let txDepth = 0;

export function getDataDir(): string {
  return dataDir;
}

export function getUploadsDir(): string {
  return uploadsDir;
}

export function getDb(): AppDatabase {
  if (!appDb) throw new Error("Baza de date nu este inițializată");
  return appDb;
}

function persist(): void {
  if (!rawDb || !dbPath || txDepth > 0) return;
  const data = rawDb.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

/** better-sqlite3 accepts { username } for @username; sql.js wants the @/$/: prefix. */
function expandNamedKeys(obj: Record<string, SqlValue>): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("@") || k.startsWith("$") || k.startsWith(":")) {
      out[k] = v;
    } else {
      out[`@${k}`] = v;
      out[`$${k}`] = v;
      out[`:${k}`] = v;
    }
  }
  return out;
}

function normalizeBind(params: BindParam[]): SqlValue[] | Record<string, SqlValue> | undefined {
  if (params.length === 0) return undefined;
  const first = params[0];
  if (
    params.length === 1 &&
    first !== null &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    !(typeof Buffer !== "undefined" && Buffer.isBuffer(first))
  ) {
    return expandNamedKeys(first as Record<string, SqlValue>);
  }
  if (params.length === 1 && Array.isArray(first)) {
    return first as SqlValue[];
  }
  return params as SqlValue[];
}

function wrapDatabase(sqlDb: SqlJsDatabase): AppDatabase {
  return {
    prepare(sql: string): AppStatement {
      return {
        get(...params: BindParam[]) {
          const stmt = sqlDb.prepare(sql);
          try {
            const bind = normalizeBind(params);
            if (bind !== undefined) stmt.bind(bind as never);
            if (stmt.step()) {
              return stmt.getAsObject();
            }
            return undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params: BindParam[]) {
          const stmt = sqlDb.prepare(sql);
          try {
            const bind = normalizeBind(params);
            if (bind !== undefined) stmt.bind(bind as never);
            const rows: Record<string, unknown>[] = [];
            while (stmt.step()) {
              rows.push(stmt.getAsObject() as Record<string, unknown>);
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params: BindParam[]): RunResult {
          const bind = normalizeBind(params);
          if (bind === undefined) {
            sqlDb.run(sql);
          } else if (Array.isArray(bind)) {
            sqlDb.run(sql, bind);
          } else {
            sqlDb.run(sql, bind);
          }
          const idRow = sqlDb.exec("SELECT last_insert_rowid() AS id");
          const lastInsertRowid = Number(idRow[0]?.values[0]?.[0] ?? 0);
          const changes = sqlDb.getRowsModified();
          persist();
          return { lastInsertRowid, changes };
        },
      };
    },
    exec(sql: string): void {
      sqlDb.exec(sql);
      persist();
    },
    transaction<T>(fn: () => T): () => T {
      return () => {
        sqlDb.run("BEGIN");
        txDepth += 1;
        try {
          const result = fn();
          sqlDb.run("COMMIT");
          txDepth -= 1;
          persist();
          return result;
        } catch (err) {
          try {
            sqlDb.run("ROLLBACK");
          } catch {
            /* ignore */
          }
          txDepth -= 1;
          throw err;
        }
      };
    },
  };
}

export async function initDatabase(baseDir: string): Promise<void> {
  dataDir = path.join(baseDir, ".data");
  uploadsDir = path.join(baseDir, "uploads");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  dbPath = path.join(dataDir, "primehr.db");

  // CJS-safe resolve: sql.js main is dist/sql-wasm.js; WASM sits beside it
  const nodeRequire = createRequire(__filename);
  const sqlJsEntry = nodeRequire.resolve("sql.js");
  const sqlJsDist = path.dirname(sqlJsEntry);
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsDist, file),
  });

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    rawDb = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    rawDb = new SQL.Database();
  }

  appDb = wrapDatabase(rawDb);

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN','MANAGER','CEO','IGM')),
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Nou',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS case_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS igm_companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS igm_candidates (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      company_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Activ',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT '',
      archive_reason TEXT NOT NULL DEFAULT '',
      last_work_date TEXT NOT NULL DEFAULT '',
      pipeline_step TEXT NOT NULL DEFAULT 'Cerere firmă',
      pipeline_step_at TEXT NOT NULL DEFAULT '',
      pipeline_deadline TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS igm_documents (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      company_id TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      number TEXT NOT NULL DEFAULT '',
      issue_date TEXT NOT NULL DEFAULT '',
      expiry_date TEXT NOT NULL DEFAULT '',
      alert_days TEXT NOT NULL DEFAULT '30',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      tracking_number TEXT NOT NULL DEFAULT '',
      sent_date TEXT NOT NULL DEFAULT '',
      delivery_date TEXT NOT NULL DEFAULT '',
      deleted_at TEXT NOT NULL DEFAULT '',
      batch_id TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS igm_submissions (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL DEFAULT '',
      company_id TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      number TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      scheduled_date TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Programat',
      deleted_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS igm_pickups (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS igm_pickup_items (
      id TEXT PRIMARY KEY,
      pickup_id TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS igm_transfers (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      from_company_id TEXT NOT NULL DEFAULT '',
      to_company_id TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      changed_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS igm_audit (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS igm_acknowledgements (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      record_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS igm_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  persist();

  ensureColumn("igm_candidates", "pipeline_step", "TEXT NOT NULL DEFAULT 'Cerere firmă'");
  ensureColumn("igm_candidates", "pipeline_step_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("igm_candidates", "pipeline_deadline", "TEXT NOT NULL DEFAULT ''");

  seedIfNeeded();
  ensureIgmUser();
}

function ensureColumn(table: string, column: string, definition: string): void {
  const database = getDb();
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  persist();
}

function seedIfNeeded(): void {
  const database = getDb();
  const count = database.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number } | undefined;
  if (count && Number(count.c) > 0) return;

  const insert = database.prepare(`
    INSERT INTO users (username, display_name, role, password_hash, must_change_password, active)
    VALUES (@username, @display_name, @role, @password_hash, 1, 1)
  `);

  const tempAdmin = bcrypt.hashSync("Admin123!@#", 10);
  const tempManager = bcrypt.hashSync("Manager123!@#", 10);
  const tempIgm = bcrypt.hashSync("Igm123!@#", 10);

  const tx = database.transaction(() => {
    insert.run({
      username: "admin",
      display_name: "Administrator",
      role: "ADMIN",
      password_hash: tempAdmin,
    });
    insert.run({
      username: "manager1",
      display_name: "Manager Demo",
      role: "MANAGER",
      password_hash: tempManager,
    });
    insert.run({
      username: "igm1",
      display_name: "Operator IGM",
      role: "IGM",
      password_hash: tempIgm,
    });
    database
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('next_case_seq', '1')")
      .run();
  });
  tx();

  console.log(
    "[db] Utilizatori seed: admin / Admin123!@#, manager1 / Manager123!@#, igm1 / Igm123!@# (schimbare obligatorie la primul login)",
  );
  console.log("[db] Persistare: sql.js → .data/primehr.db (fără native compile)");
}

/** Ensure igm1 exists on DBs created before the IGM module. */
function ensureIgmUser(): void {
  const database = getDb();
  const existing = database
    .prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE")
    .get("igm1") as { id: number } | undefined;
  if (existing) return;

  const tempIgm = bcrypt.hashSync("Igm123!@#", 10);
  database
    .prepare(
      `INSERT INTO users (username, display_name, role, password_hash, must_change_password, active)
       VALUES ('igm1', 'Operator IGM', 'IGM', ?, 1, 1)`,
    )
    .run(tempIgm);
  console.log("[db] Cont seed adăugat: igm1 / Igm123!@# (rol IGM)");
}

export function nextCaseId(): string {
  const database = getDb();
  const row = database.prepare("SELECT value FROM settings WHERE key = 'next_case_seq'").get() as
    | { value: string }
    | undefined;
  const seq = Number(row?.value ?? "1");
  database
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('next_case_seq', ?)")
    .run(String(seq + 1));
  return `C-${String(seq).padStart(4, "0")}`;
}
