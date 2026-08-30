import { requireUser } from "@/lib/auth/guard";
import { withRequestLog } from "@/lib/log";
import { hubForRequest } from "@/lib/world/registry";
import { historyEvents, historyMarks, historyMeta, snapshotAt } from "@/lib/world/history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MARK_RANGE_MS = 14 * DAY_MS;
const MAX_EVENT_RANGE_MS = 8 * DAY_MS;

function timestampParam(url: URL, name: string, fallback: number): number | Response {
  const raw = url.searchParams.get(name);
  if (raw == null) return fallback;
  if (!raw.trim()) {
    return Response.json({ error: `${name} must be a finite timestamp` }, { status: 400 });
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return Response.json({ error: `${name} must be a finite timestamp` }, { status: 400 });
  }
  return value;
}

function rangeParams(
  url: URL,
  now: number,
  maxRangeMs: number,
): { from: number; to: number } | Response {
  const from = timestampParam(url, "from", now - DAY_MS);
  if (from instanceof Response) return from;
  const to = timestampParam(url, "to", now);
  if (to instanceof Response) return to;
  if (from > to) {
    return Response.json({ error: "from must not be later than to" }, { status: 400 });
  }
  if (to - from > maxRangeMs) {
    return Response.json({ error: "History range too large" }, { status: 400 });
  }
  return { from, to };
}

export async function GET(request: Request) {
  return withRequestLog("GET", "/api/history", async () => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    const hub = await hubForRequest(request);
    const serverId = hub.getEntry().id;
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "meta";
    const now = Date.now();

    if (view === "marks") {
      const range = rangeParams(url, now, MAX_MARK_RANGE_MS);
      if (range instanceof Response) return range;
      return Response.json({ marks: await historyMarks(serverId, range.from, range.to) });
    }
    if (view === "events") {
      const range = rangeParams(url, now, MAX_EVENT_RANGE_MS);
      if (range instanceof Response) return range;
      return Response.json({ events: await historyEvents(serverId, range.from, range.to) });
    }
    if (view === "at") {
      const at = timestampParam(url, "t", now);
      if (at instanceof Response) return at;
      const snapshot = await snapshotAt(serverId, at);
      if (!snapshot) return Response.json({ t: null, entities: [] });
      return Response.json(snapshot);
    }
    return Response.json(await historyMeta(serverId));
  });
}
