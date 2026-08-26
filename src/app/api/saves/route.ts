import { getWorldHub } from "@/lib/world/hub";
import { logger, withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return withRequestLog("POST", "/api/saves", async () => {
    const hub = getWorldHub();
    await hub.whenReady();
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
    await hub.ingestUpload(file.name, bytes);
    return Response.json({ ok: true, status: hub.getStatus() });
  });
}
