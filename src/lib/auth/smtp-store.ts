import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const SMTP_PATH = path.join(DATA_DIR, "smtp.json");

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  publicUrl: string;
};

function envConfig(): SmtpConfig {
  const port = Number(process.env.FICSIT_SMTP_PORT ?? 587);
  const secureEnv = process.env.FICSIT_SMTP_SECURE;
  return {
    host: process.env.FICSIT_SMTP_HOST?.trim() ?? "",
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure: secureEnv === "1" || secureEnv === "true" || port === 465,
    user: process.env.FICSIT_SMTP_USER?.trim() ?? "",
    pass: process.env.FICSIT_SMTP_PASS ?? "",
    from: process.env.FICSIT_SMTP_FROM?.trim() ?? "",
    publicUrl: process.env.FICSIT_PUBLIC_URL?.trim() ?? "",
  };
}

function coerce(raw: unknown): SmtpConfig {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const port = Number(rec.port ?? 587);
  return {
    host: typeof rec.host === "string" ? rec.host.trim() : "",
    port: Number.isFinite(port) && port > 0 ? Math.round(port) : 587,
    secure: rec.secure === true || rec.secure === "1" || rec.secure === 1,
    user: typeof rec.user === "string" ? rec.user.trim() : "",
    pass: typeof rec.pass === "string" ? rec.pass : "",
    from: typeof rec.from === "string" ? rec.from.trim() : "",
    publicUrl: typeof rec.publicUrl === "string" ? rec.publicUrl.trim().replace(/\/$/, "") : "",
  };
}

async function readFileConfig(): Promise<SmtpConfig | null> {
  try {
    const raw = JSON.parse(await fs.readFile(SMTP_PATH, "utf8")) as unknown;
    const parsed = coerce(raw);
    if (!parsed.host && !parsed.from && !parsed.user && !parsed.publicUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** File values overlay env. Empty file fields fall back to env. */
export async function loadSmtpConfig(): Promise<SmtpConfig> {
  const file = await readFileConfig();
  const env = envConfig();
  return {
    host: file?.host || env.host,
    port: file?.host ? file.port : env.host ? env.port : file?.port || env.port,
    secure: file?.host ? file.secure : env.host ? env.secure : Boolean(file?.secure ?? env.secure),
    user: file?.user || env.user,
    pass: file?.pass || env.pass,
    from: file?.from || env.from,
    publicUrl: file?.publicUrl || env.publicUrl,
  };
}

export async function saveSmtpConfig(input: Partial<SmtpConfig> & { pass?: string }): Promise<SmtpConfig> {
  const current = await loadSmtpConfig();
  const next: SmtpConfig = {
    host: input.host?.trim() ?? current.host,
    port: typeof input.port === "number" && Number.isFinite(input.port) ? Math.round(input.port) : current.port,
    secure: typeof input.secure === "boolean" ? input.secure : current.secure,
    user: input.user?.trim() ?? current.user,
    pass: input.pass != null && input.pass !== "" ? input.pass : current.pass,
    from: input.from?.trim() ?? current.from,
    publicUrl: (input.publicUrl ?? current.publicUrl).trim().replace(/\/$/, ""),
  };
  if (next.port === 465) next.secure = true;
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${SMTP_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmp, SMTP_PATH);
  return next;
}

export function publicSmtpView(config: SmtpConfig) {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    from: config.from,
    publicUrl: config.publicUrl,
    passwordSet: Boolean(config.pass),
    configured: Boolean(config.host && config.from),
  };
}
