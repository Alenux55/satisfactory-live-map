import { requireAdmin } from "@/lib/auth/guard";
import { getRegistry, serverIdFromRequest } from "@/lib/world/registry";
import { logger, withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return withRequestLog("POST", "/api/saves", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    const registry = getRegistry();
    await registry.whenReady();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Expected a .sav file" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".sav")) {
      return Response.json({ error: "Only Satisfactory .sav files are accepted" }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    logger.info("upload received", { name: file.name, bytes: bytes.byteLength });
    if (bytes.byteLength > 80 * 1024 * 1024) {
      return Response.json({ error: "Save is larger than 80 MB" }, { status: 413 });
    }
    const serverId = await registry.ingestUpload(serverIdFromRequest(request), file.name, bytes);
    const hub = registry.getHub(serverId);
    return Response.json({ ok: true, status: hub.getStatus(), serverId });
  });
}
