import { biomeMapSvg } from "@/lib/world/biomes";

export const dynamic = "force-static";

export async function GET() {
  return new Response(biomeMapSvg(), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
