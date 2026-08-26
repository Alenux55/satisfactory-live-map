import { getWorldHub } from "@/lib/world/hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const hub = getWorldHub();
  await hub.whenReady();
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream already closed
        }
      };
      send("hello", { rev: hub.getStatus().rev });
      send("status", hub.getStatus());
      unsubscribe = hub.subscribe((event, data) => send(event, data));
      ping = setInterval(() => send("ping", { t: Date.now() }), 15000);
      ping.unref?.();
      request.signal.addEventListener("abort", () => {
        if (ping) clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (ping) clearInterval(ping);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
