import { requireUser } from "@/lib/auth/guard";
import { withRequestLog } from "@/lib/log";
import { hubForRequest } from "@/lib/world/registry";
import { historyEvents, historyMarks, historyMeta, snapshotAt } from "@/lib/world/history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRequestLog("GET", "/api/history", async () => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    const hub = await hubForRequest(request);
    const serverId = hub.getEntry().id;
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "meta";
    const now = Date.now();
    const from = Number(url.searchParams.get("from") ?? now - 24 * 60 * 60 * 1000);
    const to = Number(url.searchParams.get("to") ?? now);
    const at = Number(url.searchParams.get("t") ?? now);

    if (view === "marks") {
      return Response.json({ marks: await historyMarks(serverId, from, to) });
    }
    if (view === "events") {
      const span = Math.max(0, to - from);
      if (span > 8 * 24 * 60 * 60 * 1000) {
        return Response.json({ error: "Event range too large" }, { status: 400 });
      }
      return Response.json({ events: await historyEvents(serverId, from, to) });
    }
    if (view === "at") {
      const snapshot = await snapshotAt(serverId, at);
      if (!snapshot) return Response.json({ t: null, entities: [] });
      return Response.json(snapshot);
    }
    return Response.json(await historyMeta(serverId));
  });
}
