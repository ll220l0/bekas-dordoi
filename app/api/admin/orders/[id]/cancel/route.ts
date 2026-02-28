import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/auditLog";
import { expireStaleOrders } from "@/lib/orderLifecycle";
import { prisma } from "@/lib/prisma";

function normalizeReason(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 300);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRole(["owner", "operator"]);
  if ("response" in auth) return auth.response;

  await expireStaleOrders();

  const { id } = await params;
  const payload = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = normalizeReason(payload?.reason);

  if (!reason) {
    return NextResponse.json({ error: "Причина отмены обязательна" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  const canCancel =
    order.status === "created" ||
    order.status === "pending_confirmation" ||
    order.status === "confirmed" ||
    order.status === "cooking" ||
    order.status === "delivering";
  if (!canCancel) {
    return NextResponse.json({ error: "Можно отменять только активные заказы в ожидании или в работе" }, { status: 400 });
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: "canceled",
      canceledReason: reason,
      canceledAt: new Date()
    }
  });

  await logAdminAction({
    orderId: id,
    action: "order_canceled",
    actor: auth.session.user,
    actorRole: auth.session.role,
    meta: { reason }
  });

  return NextResponse.json({ ok: true, status: updated.status, canceledReason: updated.canceledReason });
}
