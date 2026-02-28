import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { expireStaleOrders, getDeliverySlaMinutes, getPaymentConfirmSlaMinutes, getPaymentTimeoutMinutes } from "@/lib/orderLifecycle";
import { prisma } from "@/lib/prisma";

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function minutesBetween(from: Date, to: Date) {
  const deltaMs = to.getTime() - from.getTime();
  if (!Number.isFinite(deltaMs)) return 0;
  return Math.max(0, deltaMs / 60_000);
}

function percentile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return Math.round(sorted[index]);
}

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export async function GET(req: Request) {
  const auth = await requireAdminRole(["owner", "operator"]);
  if ("response" in auth) return auth.response;

  await expireStaleOrders();

  const url = new URL(req.url);
  const days = Math.min(60, Math.max(1, Number(url.searchParams.get("days") ?? 14)));
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from } },
    include: { items: true },
    orderBy: { createdAt: "asc" }
  });

  const buckets = new Map<string, { orders: number; delivered: number; canceled: number; revenue: number; sumDelivered: number }>();
  const topItems = new Map<string, { title: string; qty: number; revenue: number }>();

  const confirmDurations: number[] = [];
  const deliveryDurations: number[] = [];

  const confirmTargetMinutes = getPaymentConfirmSlaMinutes();
  const deliveryTargetMinutes = getDeliverySlaMinutes();

  let confirmWithinTarget = 0;
  let deliveryWithinTarget = 0;

  for (const order of orders) {
    const key = dayKey(order.createdAt);
    if (!buckets.has(key)) {
      buckets.set(key, { orders: 0, delivered: 0, canceled: 0, revenue: 0, sumDelivered: 0 });
    }

    const bucket = buckets.get(key)!;
    bucket.orders += 1;

    if (order.paymentConfirmedAt) {
      const confirmMinutes = minutesBetween(order.createdAt, order.paymentConfirmedAt);
      confirmDurations.push(confirmMinutes);
      if (confirmMinutes <= confirmTargetMinutes) {
        confirmWithinTarget += 1;
      }
    }

    if (order.status === "delivered") {
      bucket.delivered += 1;
      bucket.revenue += order.totalKgs;
      bucket.sumDelivered += order.totalKgs;

      if (order.deliveredAt) {
        const deliveryBase = order.paymentConfirmedAt ?? order.createdAt;
        const deliveryMinutes = minutesBetween(deliveryBase, order.deliveredAt);
        deliveryDurations.push(deliveryMinutes);
        if (deliveryMinutes <= deliveryTargetMinutes) {
          deliveryWithinTarget += 1;
        }
      }

      for (const item of order.items) {
        const current = topItems.get(item.menuItemId) ?? { title: item.titleSnap, qty: 0, revenue: 0 };
        current.qty += item.qty;
        current.revenue += item.qty * item.priceKgs;
        topItems.set(item.menuItemId, current);
      }
    }

    if (order.status === "canceled") {
      bucket.canceled += 1;
    }
  }

  const data = Array.from({ length: days }, (_, i) => {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = dayKey(d);
    const bucket = buckets.get(key) ?? { orders: 0, delivered: 0, canceled: 0, revenue: 0, sumDelivered: 0 };
    const avgCheck = bucket.delivered > 0 ? Math.round(bucket.sumDelivered / bucket.delivered) : 0;

    return {
      date: key,
      orders: bucket.orders,
      delivered: bucket.delivered,
      canceled: bucket.canceled,
      revenueKgs: bucket.revenue,
      avgCheckKgs: avgCheck
    };
  });

  const totalRevenueKgs = data.reduce((sum, row) => sum + row.revenueKgs, 0);
  const totalDelivered = data.reduce((sum, row) => sum + row.delivered, 0);
  const totalOrders = data.reduce((sum, row) => sum + row.orders, 0);
  const totalCanceled = data.reduce((sum, row) => sum + row.canceled, 0);

  const top = [...topItems.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10)
    .map((x) => ({ title: x.title, qty: x.qty, revenueKgs: x.revenue }));

  const stalePaymentThreshold = new Date(Date.now() - getPaymentTimeoutMinutes() * 60_000);
  const staleAwaitingPayment = await prisma.order.count({
    where: {
      paymentMethod: "qr_image",
      status: { in: ["created", "pending_confirmation"] },
      createdAt: { lt: stalePaymentThreshold }
    }
  });

  return NextResponse.json({
    range: { from: dayKey(from), days },
    summary: {
      totalRevenueKgs,
      totalOrders,
      totalDelivered,
      totalCanceled,
      avgCheckKgs: totalDelivered > 0 ? Math.round(totalRevenueKgs / totalDelivered) : 0
    },
    slo: {
      paymentConfirm: {
        sampleSize: confirmDurations.length,
        targetMinutes: confirmTargetMinutes,
        p50Minutes: percentile(confirmDurations, 0.5),
        p90Minutes: percentile(confirmDurations, 0.9),
        withinTargetPct: percent(confirmWithinTarget, confirmDurations.length)
      },
      delivery: {
        sampleSize: deliveryDurations.length,
        targetMinutes: deliveryTargetMinutes,
        p50Minutes: percentile(deliveryDurations, 0.5),
        p90Minutes: percentile(deliveryDurations, 0.9),
        withinTargetPct: percent(deliveryWithinTarget, deliveryDurations.length)
      },
      cancelRatePct: percent(totalCanceled, totalOrders),
      staleAwaitingPayment
    },
    daily: data,
    topItems: top
  });
}
