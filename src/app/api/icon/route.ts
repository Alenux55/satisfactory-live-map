import { iconEtag, loadWikiIcon } from "@/lib/world/icon-cache";
import { requireUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const url = new URL(request.url);
  const files = [url.searchParams.get("file"), ...(url.searchParams.get("alt")?.split(",") ?? [])].filter(
    (value): value is string => Boolean(value),
  );
  for (const file of files) {
    const bytes = await loadWikiIcon(file);
    if (!bytes) continue;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.endsWith(".svg") ? "image/svg+xml" : "image/png",
        "Cache-Control": "private, max-age=86400",
        ETag: iconEtag(bytes),
      },
    });
  }
  return new Response("Icon unavailable", { status: 404 });
}
