import { NextResponse } from "next/server";
import { toApiError } from "@/lib/apiError";
import { expireStaleOrders } from "@/lib/orderLifecycle";
import { prisma } from "@/lib/prisma";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await expireStaleOrders();

    const { id } = await params;

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

    if (order.status === "delivered") {
      return NextResponse.json({ error: "Доставленный заказ нельзя отменить" }, { status: 400 });
    }

    if (order.status === "canceled") {
      return NextResponse.json({ ok: true, status: "canceled" });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: "canceled",
        canceledAt: new Date(),
        canceledReason: order.canceledReason ?? "Отменен клиентом"
      }
    });

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error: unknown) {
    const apiError = toApiError(error, "Не удалось отменить заказ");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
