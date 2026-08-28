import { gunzipSync } from "node:zlib";
import { requireUser } from "@/lib/auth/guard";
import { hubForRequest } from "@/lib/world/registry";
import { withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRequestLog("GET", "/api/world", async () => {
    const user = await requireUser();
    if (user instanceof Response) return user;
    const hub = await hubForRequest(request);
    const cached = hub.getSerializedSnapshot();
    const accept = request.headers.get("accept-encoding") ?? "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Accept-Encoding",
    };
    if (/\bgzip\b/i.test(accept)) {
      headers["Content-Encoding"] = "gzip";
      return new Response(new Uint8Array(cached.gzip), { headers });
    }
    return new Response(new Uint8Array(gunzipSync(cached.gzip)), { headers });
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
