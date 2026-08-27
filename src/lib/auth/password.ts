import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;
const N = 16384;
const R = 8;
const P = 1;

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length === 0 || expected.length === 0) return false;
  const key = await scrypt(password, salt, expected.length, { N: n, r, p });
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return /^[a-z0-9_]{3,32}$/.test(normalizeUsername(raw));
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? "";
  if (!value) return null;
  return value;
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}
