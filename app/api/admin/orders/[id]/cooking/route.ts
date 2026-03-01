import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/auditLog";
import { expireStaleOrders } from "@/lib/orderLifecycle";
import { prisma } from "@/lib/prisma";

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
    return NextResponse.json({ error: "Нельзя изменить статус этого заказа" }, { status: 400 });
  }

  if (order.status === "cooking" || order.status === "delivering") {
    return NextResponse.json({ ok: true, status: order.status });
  }

  if (order.status !== "confirmed") {
    return NextResponse.json({ error: "Сначала подтвердите оплату" }, { status: 400 });
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: "cooking" }
  });

  await logAdminAction({
    orderId: id,
    action: "order_cooking_started",
    actor: auth.session.user,
    actorRole: auth.session.role,
    meta: { source: "admin" }
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
