import crypto from "crypto";

export type SessionRole = "main" | "sub_admin" | "sub";

export interface SessionData {
  userId: string;
  username: string;
  role: SessionRole;
  displayName: string;
  iat: number;
  exp: number;
}

const SIGNED_SESSION_PREFIX = "v1";
const SESSION_ROLES = new Set<SessionRole>(["main", "sub_admin", "sub"]);

function signatureFor(payload: string, secret: string): Buffer {
  return crypto.createHmac("sha256", secret).update(payload).digest();
}

function isSessionData(value: unknown): value is SessionData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<SessionData>;
  return typeof data.userId === "string"
    && typeof data.username === "string"
    && typeof data.role === "string"
    && SESSION_ROLES.has(data.role as SessionRole)
    && typeof data.displayName === "string"
    && typeof data.iat === "number"
    && Number.isFinite(data.iat)
    && typeof data.exp === "number"
    && Number.isFinite(data.exp);
}

export function isSignedSessionToken(token: string): boolean {
  return token.startsWith(`${SIGNED_SESSION_PREFIX}.`);
}

export function readSignedSessionPayload(token: string): SessionData | null {
  const [prefix, encodedPayload, encodedSignature, extra] = token.split(".");
  if (prefix !== SIGNED_SESSION_PREFIX || !encodedPayload || !encodedSignature || extra) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return isSessionData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createSignedSessionToken(session: SessionData, secret: string): string {
  if (!secret) throw new Error("Signed session secret is required");
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = signatureFor(payload, secret).toString("base64url");
  return `${SIGNED_SESSION_PREFIX}.${payload}.${signature}`;
}

export function verifySignedSessionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): SessionData | null {
  const session = readSignedSessionPayload(token);
  if (!session || !secret || session.exp * 1000 <= nowMs) return null;

  const [, encodedPayload, encodedSignature] = token.split(".");
  try {
    const actual = Buffer.from(encodedSignature, "base64url");
    const expected = signatureFor(encodedPayload, secret);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  } catch {
    return null;
  }

  return session;
}
