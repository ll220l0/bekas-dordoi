import { expireStaleOrders } from "@/lib/orderLifecycle";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let lastSignature = "";

      const pushSnapshot = async () => {
        await expireStaleOrders();

        const order = await prisma.order.findUnique({
          where: { id },
          select: { id: true, status: true, updatedAt: true, paymentConfirmedAt: true, canceledAt: true, deliveredAt: true }
        });
        const signature = order ? `${order.status}:${order.updatedAt.toISOString()}` : "missing";
        if (signature === lastSignature) return;
        lastSignature = signature;
        controller.enqueue(encoder.encode(toEvent("snapshot", { order })));
      };

      try {
        await pushSnapshot();
      } catch {
        controller.enqueue(encoder.encode(toEvent("error", { message: "stream_init_failed" })));
      }

      const timer = setInterval(async () => {
        if (closed) return;
        try {
          await pushSnapshot();
          controller.enqueue(encoder.encode(toEvent("ping", { t: Date.now() })));
        } catch {
          controller.enqueue(encoder.encode(toEvent("error", { message: "stream_tick_failed" })));
        }
      }, 2500);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        controller.close();
      };

      setTimeout(close, 1000 * 60 * 10);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
