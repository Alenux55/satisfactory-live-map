import { getWorldHub } from "@/lib/world/hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const hub = getWorldHub();
  await hub.whenReady();
  return Response.json(hub.getSnapshot());
}

export async function POST() {
  const hub = getWorldHub();
  await hub.whenReady();
  await hub.tick();
  return Response.json(hub.getStatus());
}
