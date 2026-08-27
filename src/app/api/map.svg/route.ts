import { biomeMapSvg } from "@/lib/world/biomes";
import { requireUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return new Response(biomeMapSvg(), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
