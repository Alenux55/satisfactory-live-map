import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { hashPassword, isValidEmail, normalizeEmail, verifyPassword } from "./password";
import { MIN_INVITE_CODE_LENGTH, type InvitePublicView } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const INVITE_PATH = path.join(DATA_DIR, "invite.json");

export type InviteConfig = {
  codeHash: string | null;
  emails: string[];
};

function coerce(raw: unknown): InviteConfig {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const emails = Array.isArray(rec.emails)
    ? uniqueEmails(rec.emails.filter((value): value is string => typeof value === "string"))
    : [];
  return {
    codeHash: typeof rec.codeHash === "string" && rec.codeHash ? rec.codeHash : null,
    emails,
  };
}

export function uniqueEmails(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const email = normalizeEmail(value);
    if (!email || !isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function parseEmailList(raw: string): string[] {
  return uniqueEmails(raw.split(/[\s,;]+/));
}

export function randomInviteCode(): string {
  return randomBytes(9).toString("base64url");
}

export async function loadInviteConfig(): Promise<InviteConfig> {
  try {
    return coerce(JSON.parse(await fs.readFile(INVITE_PATH, "utf8")) as unknown);
  } catch {
    return { codeHash: null, emails: [] };
  }
}

export function inviteEnabled(config: InviteConfig): boolean {
  return Boolean(config.codeHash && config.emails.length);
}

export async function inviteSignupEnabled(): Promise<boolean> {
  return inviteEnabled(await loadInviteConfig());
}

export function publicInviteView(config: InviteConfig): InvitePublicView {
  return {
    enabled: inviteEnabled(config),
    codeSet: Boolean(config.codeHash),
    emails: config.emails,
  };
}

export async function saveInviteConfig(input: {
  emails?: string[];
  code?: string | null;
  disable?: boolean;
}): Promise<InviteConfig> {
  const current = await loadInviteConfig();
  let codeHash = current.codeHash;
  if (input.disable) codeHash = null;
  else if (typeof input.code === "string") {
    const code = input.code.trim();
    if (code) {
      if (code.length < MIN_INVITE_CODE_LENGTH) {
        throw new Error(`Invite code must be at least ${MIN_INVITE_CODE_LENGTH} characters`);
      }
      codeHash = await hashPassword(code);
    }
  }
  const next: InviteConfig = {
    codeHash,
    emails: input.emails ? uniqueEmails(input.emails) : current.emails,
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${INVITE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmp, INVITE_PATH);
  return next;
}

export async function verifyViewerInvite(email: string, code: string): Promise<boolean> {
  const config = await loadInviteConfig();
  if (!inviteEnabled(config) || !config.codeHash) return false;
  const key = normalizeEmail(email);
  const invited = Boolean(key && config.emails.includes(key));
  const codeOk = await verifyPassword(code.trim(), config.codeHash);
  return invited && codeOk;
}
