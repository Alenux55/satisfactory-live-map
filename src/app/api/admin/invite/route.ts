import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import {
  loadInviteConfig,
  parseEmailList,
  publicInviteView,
  randomInviteCode,
  saveInviteConfig,
} from "@/lib/auth/invite-store";
import { logger, withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return withRequestLog("GET", "/api/admin/invite", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    return NextResponse.json(publicInviteView(await loadInviteConfig()));
  });
}

export async function PUT(request: Request) {
  return withRequestLog("PUT", "/api/admin/invite", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as Record<string, unknown>;
    const emails = Array.isArray(body.emails)
      ? body.emails.filter((value): value is string => typeof value === "string")
      : typeof body.emails === "string"
        ? parseEmailList(body.emails)
        : undefined;
    try {
      const saved = await saveInviteConfig({
        emails,
        code: typeof body.code === "string" ? body.code : undefined,
        disable: body.disable === true,
      });
      logger.info("invite settings saved", {
        by: admin.username,
        enabled: publicInviteView(saved).enabled,
        emails: saved.emails.length,
      });
      return NextResponse.json(publicInviteView(saved));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not save invite settings" },
        { status: 400 },
      );
    }
  });
}

export async function POST() {
  return withRequestLog("POST", "/api/admin/invite", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    return NextResponse.json({ code: randomInviteCode() });
  });
}
