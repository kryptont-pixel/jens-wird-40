import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { requireEnv, isProduction } from "./config.js";
import { clientIp, HttpError } from "./http.js";
import { rateStore } from "./data.js";

const ADMIN_COOKIE = "jens_admin";
const GUEST_COOKIE = "jens_guest";
const GUEST_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const DUMMY_BCRYPT = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5BqgfDSV4Zf.7WZ6VfK/2x5z9mN7mKS";

function secretKey(): Uint8Array {
  const value = requireEnv("SESSION_SECRET");
  if (value.length < 32) throw new Error("Serverkonfiguration ungültig: SESSION_SECRET ist zu kurz.");
  return new TextEncoder().encode(value);
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const pair of cookie.split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function issueUploadToken(sessionId: string): Promise<string> {
  return new SignJWT({ scope: "upload" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sessionId)
    .setIssuedAt()
    .setExpirationTime("2h")
    .setJti(crypto.randomUUID())
    .sign(secretKey());
}

export async function requireUploadToken(request: Request, sessionId: string): Promise<string> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "UPLOAD_TOKEN_MISSING", "Die Upload-Sitzung ist abgelaufen.");
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.scope !== "upload" || payload.sub !== sessionId) throw new Error("scope");
    return payload.sub;
  } catch {
    throw new HttpError(401, "UPLOAD_TOKEN_INVALID", "Die Upload-Sitzung ist abgelaufen. Bitte starte den Upload erneut.");
  }
}

export async function authenticateAdmin(pin: string): Promise<boolean> {
  const validFormat = /^\d{6}$/.test(pin);
  const hash = process.env.ADMIN_PIN_HASH?.trim() ?? "";
  const matches = await bcrypt.compare(validFormat ? pin : "000000", hash || DUMMY_BCRYPT);
  return validFormat && Boolean(hash) && matches;
}

export async function createAdminCookie(): Promise<string> {
  const token = await new SignJWT({ scope: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("party-admin")
    .setIssuedAt()
    .setExpirationTime("8h")
    .setJti(crypto.randomUUID())
    .sign(secretKey());
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${isProduction() ? "; Secure" : ""}`;
}

export function clearAdminCookie(): string {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isProduction() ? "; Secure" : ""}`;
}

export async function isAdmin(request: Request): Promise<boolean> {
  const token = cookieValue(request, ADMIN_COOKIE);
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.scope === "admin" && payload.sub === "party-admin";
  } catch {
    return false;
  }
}

export async function requireAdmin(request: Request): Promise<void> {
  if (!(await isAdmin(request))) {
    throw new HttpError(401, "ADMIN_REQUIRED", "Deine Adminsitzung ist abgelaufen. Bitte melde dich erneut an.");
  }
}

export async function getGuestId(request: Request): Promise<string | null> {
  const token = cookieValue(request, GUEST_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.scope === "guest" && typeof payload.sub === "string" && /^[0-9a-f-]{36}$/i.test(payload.sub)
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}

export async function getOrCreateGuest(request: Request): Promise<{ id: string; cookie?: string }> {
  const existingId = await getGuestId(request);
  if (existingId) return { id: existingId };

  const id = crypto.randomUUID();
  const token = await new SignJWT({ scope: "guest" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime(`${GUEST_COOKIE_MAX_AGE}s`)
    .setJti(crypto.randomUUID())
    .sign(secretKey());
  const cookie = `${GUEST_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${GUEST_COOKIE_MAX_AGE}${isProduction() ? "; Secure" : ""}`;
  return { id, cookie };
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds;
  const identity = createHash("sha256").update(`${scope}:${clientIp(request)}`).digest("hex").slice(0, 32);
  const key = `${scope}/${windowStart}/${identity}`;
  const store = rateStore();
  const current = (await store.get(key, { type: "json" })) as { count: number } | null;
  const next = (current?.count ?? 0) + 1;
  if (next > limit) throw new HttpError(429, "RATE_LIMITED", "Zu viele Versuche. Bitte warte einen Moment.");
  await store.setJSON(key, { count: next, expiresAt: new Date((windowStart + windowSeconds * 2) * 1000).toISOString() });
}
