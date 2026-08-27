import nodemailer from "nodemailer";
import { logger } from "@/lib/log";

export function smtpConfigured(): boolean {
  return Boolean(process.env.FICSIT_SMTP_HOST?.trim() && process.env.FICSIT_SMTP_FROM?.trim());
}

export function publicOrigin(request: Request): string {
  const fromEnv = process.env.FICSIT_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "127.0.0.1:43147";
  return `${proto}://${host}`;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!smtpConfigured()) {
    throw new Error("SMTP is not configured");
  }
  const host = process.env.FICSIT_SMTP_HOST!.trim();
  const port = Number(process.env.FICSIT_SMTP_PORT ?? 587);
  const secure =
    process.env.FICSIT_SMTP_SECURE === "1" || process.env.FICSIT_SMTP_SECURE === "true" || port === 465;
  const user = process.env.FICSIT_SMTP_USER?.trim();
  const pass = process.env.FICSIT_SMTP_PASS;
  const from = process.env.FICSIT_SMTP_FROM!.trim();
  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: user ? { user, pass: pass ?? "" } : undefined,
  });
  await transporter.sendMail({
    from,
    to,
    subject: "FICSIT Live Map password reset",
    text: `A password reset was requested for your FICSIT Live Map account.\n\nOpen this link (expires in 1 hour):\n${resetUrl}\n\nIf you did not ask for this, you can ignore this email.`,
  });
  logger.info("password reset email sent", { to });
}
