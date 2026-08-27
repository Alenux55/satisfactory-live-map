import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { COOKIE_NAME, SESSION_DAYS } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const SECRET_PATH = path.join(DATA_DIR, "auth-secret.txt");

let cachedSecret: string | null = null;

async function getSecret(): Promise<string> {
  const fromEnv = process.env.FICSIT_AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (cachedSecret) return cachedSecret;
  try {
    cachedSecret = (await fs.readFile(SECRET_PATH, "utf8")).trim();
    if (cachedSecret) return cachedSecret;
  } catch {
    // first boot
  }
  const generated = randomBytes(32).toString("hex");
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SECRET_PATH, generated, { encoding: "utf8", mode: 0o600 });
  cachedSecret = generated;
  return generated;
}

function b64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payload).digest());
}

export type SessionClaims = {
  uid: string;
  exp: number;
};

export async function encodeSession(userId: string): Promise<string> {
  const secret = await getSecret();
  const claims: SessionClaims = {
    uid: userId,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  const payload = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
  return `${payload}.${sign(payload, secret)}`;
}

export async function decodeSession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const secret = await getSecret();
  const expected = sign(payload, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
    if (!claims.uid || typeof claims.exp !== "number" || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

function cookieSecure(request?: Request): boolean {
  if (process.env.FICSIT_COOKIE_SECURE === "1") return true;
  if (process.env.FICSIT_COOKIE_SECURE === "0") return false;
  const proto = request?.headers.get("x-forwarded-proto") ?? "";
  return proto === "https";
}

export async function setSessionCookie(userId: string, request?: Request): Promise<void> {
  const store = await cookies();
  const token = await encodeSession(userId);
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    secure: cookieSecure(request),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function readSessionCookie(): Promise<SessionClaims | null> {
  const store = await cookies();
  return decodeSession(store.get(COOKIE_NAME)?.value);
}
