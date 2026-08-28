import { NextResponse } from "next/server";
import { parseFromHeader } from "@/lib/auth/from-header";
import { isValidEmail } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/guard";
import { sendSmtpTestEmail } from "@/lib/auth/mail";
import { loadSmtpConfig, publicSmtpView, saveSmtpConfig } from "@/lib/auth/smtp-store";
import { logger, withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return withRequestLog("GET", "/api/admin/smtp", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    const config = await loadSmtpConfig();
    return NextResponse.json(publicSmtpView(config));
  });
}

export async function PUT(request: Request) {
  return withRequestLog("PUT", "/api/admin/smtp", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as Record<string, unknown>;
    const from = typeof body.from === "string" ? body.from : "";
    const fromAddress = parseFromHeader(from).address;
    if (from && !isValidEmail(fromAddress)) {
      return NextResponse.json(
        { error: "From needs a mailbox address (the name is optional)" },
        { status: 400 },
      );
    }
    const saved = await saveSmtpConfig({
      host: typeof body.host === "string" ? body.host : undefined,
      port: typeof body.port === "number" ? body.port : Number(body.port),
      secure: typeof body.secure === "boolean" ? body.secure : undefined,
      user: typeof body.user === "string" ? body.user : undefined,
      pass: typeof body.pass === "string" ? body.pass : undefined,
      from: typeof body.from === "string" ? body.from : undefined,
      publicUrl: typeof body.publicUrl === "string" ? body.publicUrl : undefined,
    });
    logger.info("smtp settings saved", { by: admin.username, host: saved.host });
    return NextResponse.json(publicSmtpView(saved));
  });
}

export async function POST(request: Request) {
  return withRequestLog("POST", "/api/admin/smtp", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as Record<string, unknown>;
    const to = typeof body.to === "string" ? body.to.trim() : admin.email ?? "";
    if (!to || !isValidEmail(to)) {
      return NextResponse.json(
        { error: "Enter a destination email (or add one to your account)" },
        { status: 400 },
      );
    }
    try {
      await sendSmtpTestEmail(to, {
        host: typeof body.host === "string" ? body.host : undefined,
        port: typeof body.port === "number" ? body.port : Number(body.port) || undefined,
        secure: typeof body.secure === "boolean" ? body.secure : undefined,
        user: typeof body.user === "string" ? body.user : undefined,
        pass: typeof body.pass === "string" ? body.pass : undefined,
        from: typeof body.from === "string" ? body.from : undefined,
      });
      return NextResponse.json({ ok: true, to });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("smtp test failed", { by: admin.username, err: message });
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
