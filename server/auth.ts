import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb, type Role, type UserRow } from "./db";

const SESSION_HOURS = 12;

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

export function publicUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: row.must_change_password === 1,
  };
}

export function login(username: string, password: string): { token: string; user: SessionUser } {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(username.trim()) as UserRow | undefined;

  if (!row || !row.active) {
    throw new AuthError("Utilizator sau parolă invalidă");
  }

  if (!bcrypt.compareSync(password, row.password_hash)) {
    throw new AuthError("Utilizator sau parolă invalidă");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    row.id,
    expires,
  );

  return { token, user: publicUser(row) };
}

export function logout(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getUserByToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`,
    )
    .get(token) as UserRow | undefined;
  return row ? publicUser(row) : null;
}

export function changePassword(
  userId: number,
  currentPassword: string | null,
  newPassword: string,
  force = false,
): SessionUser {
  if (!newPassword || newPassword.length < 12) {
    throw new AuthError("Parola nouă trebuie să aibă cel puțin 12 caractere");
  }

  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  if (!row) throw new AuthError("Utilizator inexistent");

  if (!force) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, row.password_hash)) {
      throw new AuthError("Parola curentă este greșită");
    }
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(
    hash,
    userId,
  );

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow;
  return publicUser(updated);
}

export class AuthError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
