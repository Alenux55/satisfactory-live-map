import { getRegistry, hubForRequest } from "@/lib/world/registry";
import type { ConfigPatch } from "@/lib/world/types";
import { withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRequestLog("GET", "/api/config", async () => {
    const registry = getRegistry();
    await registry.whenReady();
    const hub = await hubForRequest(request);
    return Response.json({ config: registry.getConfig(), status: hub.getStatus() });
  });
}

export async function PUT(request: Request) {
  return withRequestLog("PUT", "/api/config", async () => {
    const registry = getRegistry();
    await registry.whenReady();
    const patch = (await request.json()) as ConfigPatch;
    const { config, added } = await registry.update(patch);
    const hub = added ? getRegistry().getHub(added.id) : await hubForRequest(request);
    return Response.json({ config, status: hub.getStatus(), added });
  });
}
