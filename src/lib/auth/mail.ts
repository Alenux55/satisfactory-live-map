import nodemailer from "nodemailer";
import { logger } from "@/lib/log";
import { loadSmtpConfig, type SmtpConfig } from "./smtp-store";

export async function smtpConfigured(): Promise<boolean> {
  const config = await loadSmtpConfig();
  return Boolean(config.host && config.from);
}

export async function publicOrigin(request: Request): Promise<string> {
  const config = await loadSmtpConfig();
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "127.0.0.1:43147";
  return `${proto}://${host}`;
}

function transporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure || config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const config = await loadSmtpConfig();
  if (!config.host || !config.from) {
    throw new Error("SMTP is not configured");
  }
  await transporter(config).sendMail({
    from: config.from,
    to,
    subject: "FICSIT Live Map password reset",
    text: `A password reset was requested for your FICSIT Live Map account.\n\nOpen this link (expires in 1 hour):\n${resetUrl}\n\nIf you did not ask for this, you can ignore this email.`,
  });
  logger.info("password reset email sent", { to });
}

export async function sendSmtpTestEmail(to: string, override?: Partial<SmtpConfig>): Promise<void> {
  const stored = await loadSmtpConfig();
  const config: SmtpConfig = {
    ...stored,
    ...override,
    pass: override?.pass && override.pass !== "" ? override.pass : stored.pass,
  };
  if (!config.host || !config.from) {
    throw new Error("Set SMTP host and From address first");
  }
  const mailer = transporter(config);
  await mailer.verify();
  await mailer.sendMail({
    from: config.from,
    to,
    subject: "FICSIT Live Map SMTP test",
    text: `This is a test message from FICSIT Live Map.\n\nIf you received it, outbound mail is working.\n`,
  });
  logger.info("smtp test email sent", { to, host: config.host });
}
