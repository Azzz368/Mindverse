import "server-only";

import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { postgresConfigured, queryPostgres, withPostgresTransaction } from "@/server/db/postgres";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "mindverse_session";
const SESSION_DAYS = Math.max(1, Number(process.env.MINDVERSE_SESSION_MAX_AGE_DAYS || 30));
const PASSWORD_MIN_LENGTH = 10;
const developmentAuthSecret = "mindverse-local-development-secret-change-before-deploy";
const localAuthBypassEnabled = () =>
  process.env.NODE_ENV !== "production" && process.env.MINDVERSE_LOCAL_AUTH_BYPASS === "true";
const localAuthContext = (): AuthContext => ({
  userId: "local-test-user",
  email: "local@example.test",
  name: "Local Tester",
  workspaceId: "local-test-workspace",
  workspaceName: "Local test workspace",
  role: "owner",
  sessionExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
});

export type AuthContext = {
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  role: "owner" | "editor" | "viewer";
  sessionExpiresAt: string;
};

export class AuthError extends Error {
  constructor(message: string, public status = 401, public code = "UNAUTHORIZED") {
    super(message);
    this.name = "AuthError";
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const cleanName = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";

async function passwordHash(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString("base64")}:${derived.toString("base64")}`;
}

async function passwordMatches(password: string, stored: string) {
  const [algorithm, saltValue, hashValue] = stored.split(":");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64");
  const actual = await scrypt(password, Buffer.from(saltValue, "base64"), expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const authSecret = () => {
  const value = process.env.MINDVERSE_AUTH_SECRET?.trim() || (process.env.NODE_ENV !== "production" ? developmentAuthSecret : "");
  if (value.length < 32) throw new AuthError("Authentication is not configured.", 503, "AUTH_NOT_CONFIGURED");
  return value;
};
const authStorage = () => {
  if (!postgresConfigured()) throw new AuthError("数据库尚未配置。请设置 DATABASE_URL 并执行数据库迁移。", 503, "DATABASE_NOT_CONFIGURED");
};
const sessionSignature = (value: string) => createHmac("sha256", authSecret()).update(value).digest("base64url");
const encodeSessionToken = (rawToken: string, expires: Date) => {
  const payload = `${rawToken}.${Math.floor(expires.getTime() / 1000)}`;
  return `${payload}.${sessionSignature(payload)}`;
};
const decodeSessionToken = (token: string) => {
  const [rawToken, expiresAt, signature, ...extra] = token.split(".");
  if (!rawToken || !expiresAt || !signature || extra.length) return "";
  const payload = `${rawToken}.${expiresAt}`;
  const expected = Buffer.from(sessionSignature(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return "";
  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) * 1000 <= Date.now()) return "";
  return rawToken;
};

const cookieToken = (headers: Headers) => {
  const cookie = headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeSessionToken(decodeURIComponent(rest.join("=")));
  }
  return "";
};

export const sessionCookie = (token: string, expires: Date) => ({
  name: SESSION_COOKIE,
  value: encodeSessionToken(token, expires),
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  },
});

export const clearedSessionCookie = () => ({
  name: SESSION_COOKIE,
  value: "",
  options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 },
});

async function newSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await queryPostgres(
    `INSERT INTO mindverse_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, sha256(token), expires],
  );
  return { token, expires };
}

export async function registerUser(input: { email?: unknown; name?: unknown; password?: unknown; inviteCode?: unknown }) {
  authSecret();
  authStorage();
  const email = normalizeEmail(input.email);
  const name = cleanName(input.name);
  const password = typeof input.password === "string" ? input.password : "";
  if (!validEmail(email)) throw new AuthError("请输入有效的邮箱地址。", 400, "INVALID_EMAIL");
  if (name.length < 2) throw new AuthError("姓名至少需要 2 个字符。", 400, "INVALID_NAME");
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 128) throw new AuthError(`密码需要 ${PASSWORD_MIN_LENGTH}–128 个字符。`, 400, "INVALID_PASSWORD");

  const registrationMode = (process.env.MINDVERSE_REGISTRATION_MODE || (process.env.NODE_ENV === "production" ? "invite" : "open")).trim();
  const configuredInvite = process.env.MINDVERSE_REGISTRATION_INVITE_CODE?.trim() || "";
  if (registrationMode !== "open") {
    if (!configuredInvite) throw new AuthError("服务器尚未配置注册邀请码。", 503, "REGISTRATION_NOT_CONFIGURED");
    const provided = typeof input.inviteCode === "string" ? input.inviteCode.trim() : "";
    const expected = Buffer.from(sha256(configuredInvite));
    const actual = Buffer.from(sha256(provided));
    if (!timingSafeEqual(expected, actual)) throw new AuthError("邀请码无效。", 403, "INVALID_INVITE");
  }

  const hash = await passwordHash(password);
  let userId = "";
  await withPostgresTransaction(async (client) => {
    const existing = await client.query(`SELECT 1 FROM mindverse_users WHERE lower(email) = $1 LIMIT 1`, [email]);
    if (existing.rowCount) throw new AuthError("该邮箱已经注册，请直接登录。", 409, "EMAIL_EXISTS");
    const user = await client.query<{ id: string }>(
      `INSERT INTO mindverse_users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
      [email, name, hash],
    );
    userId = user.rows[0].id;
    const workspace = await client.query<{ id: string }>(
      `INSERT INTO mindverse_workspaces (name, owner_user_id) VALUES ($1, $2) RETURNING id`,
      [`${name} 的创作空间`, userId],
    );
    await client.query(
      `INSERT INTO mindverse_workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspace.rows[0].id, userId],
    );
  });
  return { ...(await newSession(userId)), userId };
}

export async function loginUser(input: { email?: unknown; password?: unknown }) {
  authSecret();
  authStorage();
  const email = normalizeEmail(input.email);
  const password = typeof input.password === "string" ? input.password : "";
  const result = await queryPostgres<{ id: string; password_hash: string; disabled_at: Date | null }>(
    `SELECT id, password_hash, disabled_at FROM mindverse_users WHERE lower(email) = $1 LIMIT 1`,
    [email],
  );
  const user = result.rows[0];
  const valid = user ? await passwordMatches(password, user.password_hash) : false;
  if (!user || !valid) throw new AuthError("邮箱或密码不正确。", 401, "INVALID_CREDENTIALS");
  if (user.disabled_at) throw new AuthError("此账户已被停用。", 403, "ACCOUNT_DISABLED");
  return { ...(await newSession(user.id)), userId: user.id };
}

export async function sessionFromHeaders(headers: Headers): Promise<AuthContext | null> {
  if (localAuthBypassEnabled()) return localAuthContext();
  if (!postgresConfigured()) return null;
  let token = "";
  try { token = cookieToken(headers); } catch { return null; }
  if (!token) return null;
  const result = await queryPostgres<{
    user_id: string; email: string; name: string; expires_at: Date;
    workspace_id: string; workspace_name: string; role: AuthContext["role"];
  }>(
    `SELECT u.id AS user_id, u.email, u.name, s.expires_at,
            w.id AS workspace_id, w.name AS workspace_name, wm.role
       FROM mindverse_sessions s
       JOIN mindverse_users u ON u.id = s.user_id
       JOIN mindverse_workspace_members wm ON wm.user_id = u.id
       JOIN mindverse_workspaces w ON w.id = wm.workspace_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled_at IS NULL
      ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, wm.created_at
      LIMIT 1`,
    [sha256(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    role: row.role,
    sessionExpiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function requireSession(request: Request) {
  if (localAuthBypassEnabled()) return localAuthContext();
  const session = await sessionFromHeaders(request.headers);
  if (!session) throw new AuthError("请先登录。", 401, "UNAUTHORIZED");
  return session;
}

export async function revokeSession(headers: Headers) {
  const token = cookieToken(headers);
  if (token) await queryPostgres(`DELETE FROM mindverse_sessions WHERE token_hash = $1`, [sha256(token)]);
}

export const authErrorResponse = (error: unknown, fallback = "请求失败。") => {
  const status = error instanceof AuthError ? error.status : 500;
  const code = error instanceof AuthError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof AuthError ? error.message : fallback;
  return { status, body: { ok: false as const, error: { message, code, status } } };
};
