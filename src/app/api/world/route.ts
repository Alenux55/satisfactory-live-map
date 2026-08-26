import { getWorldHub } from "@/lib/world/hub";
import { logger, withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return withRequestLog("GET", "/api/world", async () => {
    const hub = getWorldHub();
    await hub.whenReady();
    const snapshot = hub.getSnapshot();
    const started = Date.now();
    const body = JSON.stringify(snapshot);
    logger.info("snapshot serialized", {
      rev: snapshot.rev,
      entities: snapshot.entityCount,
      bytes: body.length,
      ms: Date.now() - started,
    });
    return new Response(body, {
      headers: { "Content-Type": "application/json" },
    });
  });
}

export async function POST() {
  return withRequestLog("POST", "/api/world", async () => {
    const hub = getWorldHub();
    await hub.whenReady();
    await hub.tick();
    return Response.json(hub.getStatus());
  });
}
