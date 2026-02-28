import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/auditLog";
import { expireStaleOrders } from "@/lib/orderLifecycle";
import { prisma } from "@/lib/prisma";

const CONFIRMED_STATUSES = new Set<string>(["confirmed", "cooking", "delivering", "delivered"]);

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRole(["owner", "operator"]);
  if ("response" in auth) return auth.response;

  await expireStaleOrders();

  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  if (order.status === "canceled" || order.status === "delivered") {
    return NextResponse.json({ error: "Нельзя подтвердить этот заказ" }, { status: 400 });
  }

  if (CONFIRMED_STATUSES.has(order.status)) {
    return NextResponse.json({ ok: true, status: order.status });
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: "confirmed",
      paymentConfirmedAt: order.paymentConfirmedAt ?? new Date(),
      canceledReason: null,
      canceledAt: null
    }
  });

  await logAdminAction({
    orderId: id,
    action: "payment_confirmed",
    actor: auth.session.user,
    actorRole: auth.session.role,
    meta: { source: "admin" }
  });

  return NextResponse.json({ ok: true, status: updated.status });
}

