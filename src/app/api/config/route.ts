import { getWorldHub } from "@/lib/world/hub";
import type { HubConfig } from "@/lib/world/types";
import { withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return withRequestLog("GET", "/api/config", async () => {
    const hub = getWorldHub();
    await hub.whenReady();
    return Response.json({ config: hub.getConfig(), status: hub.getStatus() });
  });
}

export async function PUT(request: Request) {
  return withRequestLog("PUT", "/api/config", async () => {
    const hub = getWorldHub();
    await hub.whenReady();
    const patch = (await request.json()) as Partial<HubConfig>;
    const config = await hub.updateConfig(patch);
    return Response.json({ config, status: hub.getStatus() });
  });
}
