import { requireUser } from "@/lib/auth/guard";
import { hubForRequest } from "@/lib/world/registry";
import { logger, withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRequestLog("GET", "/api/world", async () => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    const hub = await hubForRequest(request);
    const snapshot = hub.getSnapshot();
    const started = Date.now();
    const body = JSON.stringify(snapshot);
    logger.info("snapshot serialized", {
      rev: snapshot.rev,
      entities: snapshot.entityCount,
      bytes: body.length,
      ms: Date.now() - started,
      serverId: hub.getEntry().id,
    });
    return new Response(body, {
      headers: { "Content-Type": "application/json" },
    });
  });
}

export async function POST(request: Request) {
  return withRequestLog("POST", "/api/world", async () => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    const hub = await hubForRequest(request);
    await hub.tick();
    return Response.json(hub.getStatus());
  });
}
