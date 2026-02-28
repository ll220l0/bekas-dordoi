import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const STALE_PAYMENT_STATUSES: OrderStatus[] = ["created", "pending_confirmation"];
const ACTIVE_STATUSES: OrderStatus[] = ["created", "pending_confirmation", "confirmed", "cooking", "delivering"];

const DEFAULT_PAYMENT_TIMEOUT_MINUTES = 8;
const DEFAULT_CREATE_LIMIT_PER_MINUTE = 20;
const DEFAULT_CREATE_THROTTLE_DELAY_MS = 450;
const SWEEP_MIN_INTERVAL_MS = 12_000;

let lastSweepAtMs = 0;

function readIntEnv(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return Math.min(max, Math.max(min, rounded));
}

export function getPaymentTimeoutMinutes() {
  return readIntEnv("ORDER_PAYMENT_TIMEOUT_MINUTES", DEFAULT_PAYMENT_TIMEOUT_MINUTES, 1, 180);
}

export function getOrderCreateLimitPerMinute() {
  return readIntEnv("ORDER_CREATE_LIMIT_PER_MINUTE", DEFAULT_CREATE_LIMIT_PER_MINUTE, 1, 400);
}

export function getOrderCreateThrottleDelayMs() {
  return readIntEnv("ORDER_CREATE_THROTTLE_DELAY_MS", DEFAULT_CREATE_THROTTLE_DELAY_MS, 0, 10_000);
}

export function getPaymentConfirmSlaMinutes() {
  return readIntEnv("SLO_PAYMENT_CONFIRM_MINUTES", 8, 1, 180);
}

export function getDeliverySlaMinutes() {
  return readIntEnv("SLO_DELIVERY_MINUTES", 35, 5, 600);
}

function buildExpiredReason(timeoutMinutes: number) {
  return `Не оплачено в течение ${timeoutMinutes} мин`;
}

type ExpireResult = {
  ran: boolean;
  expired: number;
  cutoff: Date;
};

export async function expireStaleOrders(options?: { force?: boolean }) {
  const now = Date.now();
  const force = options?.force === true;

  if (!force && now - lastSweepAtMs < SWEEP_MIN_INTERVAL_MS) {
    const timeoutMinutes = getPaymentTimeoutMinutes();
    return {
      ran: false,
      expired: 0,
      cutoff: new Date(now - timeoutMinutes * 60_000)
    } satisfies ExpireResult;
  }

  lastSweepAtMs = now;

  const timeoutMinutes = getPaymentTimeoutMinutes();
  const cutoff = new Date(now - timeoutMinutes * 60_000);
  const reason = buildExpiredReason(timeoutMinutes);

  const result = await prisma.order.updateMany({
    where: {
      paymentMethod: "qr_image",
      status: { in: STALE_PAYMENT_STATUSES },
      createdAt: { lt: cutoff }
    },
    data: {
      status: "canceled",
      canceledAt: new Date(now),
      canceledReason: reason
    }
  });

  return {
    ran: true,
    expired: result.count,
    cutoff
  } satisfies ExpireResult;
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ThrottleResult = {
  limited: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
};

export async function checkOrderCreateThrottle(restaurantId: string) {
  const limit = getOrderCreateLimitPerMinute();
  const from = new Date(Date.now() - 60_000);
  const where = {
    restaurantId,
    createdAt: { gte: from },
    status: { in: ACTIVE_STATUSES }
  } as const;

  const firstCount = await prisma.order.count({ where });
  if (firstCount < limit) {
    return {
      limited: false,
      count: firstCount,
      limit,
      retryAfterSeconds: 0
    } satisfies ThrottleResult;
  }

  await sleep(getOrderCreateThrottleDelayMs());

  const secondCount = await prisma.order.count({ where });
  if (secondCount < limit) {
    return {
      limited: false,
      count: secondCount,
      limit,
      retryAfterSeconds: 0
    } satisfies ThrottleResult;
  }

  const overflow = Math.max(1, secondCount - limit + 1);
  const retryAfterSeconds = Math.min(30, Math.max(5, overflow * 3));

  return {
    limited: true,
    count: secondCount,
    limit,
    retryAfterSeconds
  } satisfies ThrottleResult;
}
