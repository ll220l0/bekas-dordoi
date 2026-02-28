"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Photo } from "@/components/ui";
import { ClientNav } from "@/components/ClientNav";
import {
  clearActiveOrderId,
  clearPendingPayOrderId,
  getActiveOrderId,
  getLastOrderId,
  getOrderHistory,
  getPendingPayOrderId,
  getSavedPhone,
  setActiveOrderId,
  setPendingPayOrderId
} from "@/lib/clientPrefs";
import { formatKgs } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/paymentMethod";
import { getOrderStatusMeta, isApprovedStatus, isHistoryStatus, isPendingConfirmation } from "@/lib/orderStatus";

type OrderItem = {
  id: string;
  menuItemId?: string;
  title: string;
  qty: number;
  priceKgs: number;
  photoUrl: string;
};

type OrderData = {
  id: string;
  status: string;
  paymentMethod: string;
  totalKgs: number;
  payerName?: string;
  comment?: string;
  customerPhone?: string;
  location?: { line?: string; container?: string; landmark?: string };
  restaurant?: { name?: string; slug?: string };
  createdAt: string;
  updatedAt: string;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
  canceledAt?: string | null;
  items: OrderItem[];
};

type HistoryOrder = {
  id: string;
  status: string;
  paymentMethod: string;
  totalKgs: number;
  payerName?: string;
  comment?: string;
  customerPhone?: string;
  location?: { line?: string; container?: string; landmark?: string };
  restaurant?: { name?: string; slug?: string };
  createdAt: string;
  updatedAt: string;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
  canceledAt?: string | null;
  items: OrderItem[];
};

const DELIVERY_WAIT_STATUSES = new Set(["confirmed", "cooking", "delivering"]);

function IconCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCross({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 7L17 17M17 7L7 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconAlert({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 7V13" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.35" fill="currentColor" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.35" />
    </svg>
  );
}

function IconChevron({ open, className = "h-3.5 w-3.5" }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`${className} transition-transform ${open ? "rotate-180" : "rotate-0"}`}
      aria-hidden="true"
    >
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHistory({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.3-5.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 4v3.8h3.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8.5v4l2.8 1.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusProgress({ status }: { status: string }) {
  if (isPendingConfirmation(status)) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        <div className="text-sm font-semibold text-amber-700">РћР¶РёРґР°РµРј РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Р·Р°РєР°Р·Р°</div>
      </div>
    );
  }

  if (status === "delivered") {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
          <IconCheck />
        </div>
        <div className="text-sm font-semibold text-emerald-700">РЎРїР°СЃРёР±Рѕ Р·Р° РІС‹Р±РѕСЂ. Р—Р°РєР°Р· РґРѕСЃС‚Р°РІР»РµРЅ.</div>
      </div>
    );
  }

  if (isApprovedStatus(status)) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
          <IconCheck />
        </div>
        <div className="text-sm font-semibold text-emerald-700">Р—Р°РєР°Р· РїРѕРґС‚РІРµСЂР¶РґРµРЅ</div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white">
        <IconAlert />
      </div>
      <div className="text-sm font-semibold text-rose-700">Р—Р°РєР°Р· РѕС‚РјРµРЅРµРЅ</div>
    </div>
  );
}

function parseIsoDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatEtaText(date: Date | null) {
  if (!date) return "ETA уточняется";

  const now = Date.now();
  const diffMs = date.getTime() - now;
  if (diffMs <= 0) {
    return `Плановое время: ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `Примерно через ${minutes} мин`;

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `Примерно через ${hours} ч ${remainMinutes} мин`;
}

function resolveDeliveryEta({
  status,
  createdAt,
  paymentConfirmedAt,
  deliveredAt
}: {
  status: string;
  createdAt?: string;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
}) {
  const created = parseIsoDate(createdAt ?? null);
  const paymentConfirmed = parseIsoDate(paymentConfirmedAt ?? null);
  const delivered = parseIsoDate(deliveredAt ?? null);

  if (status === "delivered") return delivered;
  if (!created) return null;

  const base = paymentConfirmed ?? created;
  if (status === "confirmed") return new Date(base.getTime() + 35 * 60_000);
  if (status === "cooking") return new Date(base.getTime() + 22 * 60_000);
  if (status === "delivering") return new Date(base.getTime() + 10 * 60_000);
  if (status === "created" || status === "pending_confirmation") return new Date(created.getTime() + 45 * 60_000);
  return null;
}

const DELIVERY_STEPS = ["Подтвержден", "Готовится", "Передан курьеру", "Доставлен"] as const;

function currentDeliveryStep(status: string) {
  if (status === "confirmed") return 0;
  if (status === "cooking") return 1;
  if (status === "delivering") return 2;
  if (status === "delivered") return 3;
  return -1;
}

function DeliveryTracker({
  status,
  createdAt,
  paymentConfirmedAt,
  deliveredAt
}: {
  status: string;
  createdAt?: string;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
}) {
  if (status === "canceled") return null;

  const activeStep = currentDeliveryStep(status);
  const eta = resolveDeliveryEta({ status, createdAt, paymentConfirmedAt, deliveredAt });

  if (activeStep < 0) {
    return (
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Этапы доставки</div>
        <div className="mt-1 text-sm font-semibold text-slate-700">Ожидаем подтверждения оплаты</div>
        <div className="mt-1 text-xs text-slate-600">{formatEtaText(eta)}</div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Этапы доставки</div>
      <div className="mt-2 space-y-2">
        {DELIVERY_STEPS.map((step, index) => {
          const done = index < activeStep || status === "delivered";
          const current = index === activeStep && status !== "delivered";

          return (
            <div key={step} className="flex items-center gap-2">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done
                    ? "bg-emerald-600 text-white"
                    : current
                      ? "bg-sky-500 text-white shadow-[0_0_0_5px_rgba(14,165,233,0.16)]"
                      : "bg-white text-slate-500 ring-1 ring-slate-200"
                }`}
              >
                {done ? <IconCheck className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={`text-sm ${done || current ? "font-semibold text-slate-800" : "text-slate-500"}`}>{step}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-slate-600">{status === "delivered" ? "Заказ доставлен" : `ETA: ${formatEtaText(eta)}`}</div>
    </div>
  );
}
function historyStatusIcon(status: string) {
  if (status === "delivered") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <IconCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "canceled") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700">
        <IconCross className="h-3.5 w-3.5" />
      </span>
    );
  }
  return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">вЂў</span>;
}

export default function OrderScreen({ orderId }: { orderId: string }) {
  const [data, setData] = useState<OrderData | null>(null);
  const [orderMissing, setOrderMissing] = useState(false);
  const [orderLoading, setOrderLoading] = useState(true);
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [orderHref, setOrderHref] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openedHistoryOrderId, setOpenedHistoryOrderId] = useState<string | null>(null);
  const [showDeliveredFx, setShowDeliveredFx] = useState(false);
  const [showCanceledFx, setShowCanceledFx] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  const loadOrder = useCallback(
    async (silent = false) => {
      if (!silent) setOrderLoading(true);
      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (res.status === 404) {
          setData(null);
          setOrderMissing(true);
          return;
        }
        if (!res.ok) return;

        const j = (await res.json()) as OrderData;
        setData(j);
        setOrderMissing(false);
      } finally {
        if (!silent) setOrderLoading(false);
      }
    },
    [orderId]
  );

  const loadHistory = useCallback(async () => {
    const ids = getOrderHistory()
      .map((entry) => entry.orderId)
      .filter(Boolean);
    const phone = getSavedPhone().replace(/\D/g, "").trim();

    if (ids.length === 0 && phone.length < 7) {
      setHistory([]);
      return;
    }

    const params = new URLSearchParams();
    if (ids.length > 0) params.set("ids", ids.slice(0, 30).join(","));
    if (phone.length >= 7) params.set("phone", phone);

    const res = await fetch(`/api/orders/history?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      setHistory([]);
      return;
    }

    const j = (await res.json()) as { orders: HistoryOrder[] };
    setHistory((j.orders ?? []).filter((order) => isHistoryStatus(order.status)));
  }, []);

  useEffect(() => {
    const pendingPayOrderId = getPendingPayOrderId();
    if (pendingPayOrderId) {
      setLastOrderId(pendingPayOrderId);
      setOrderHref(`/pay/${pendingPayOrderId}`);
      return;
    }

    const activeOrderId = getActiveOrderId();
    if (activeOrderId) {
      setLastOrderId(activeOrderId);
      setOrderHref(`/order/${activeOrderId}`);
      return;
    }

    const lastOrderIdValue = getLastOrderId();
    setLastOrderId(lastOrderIdValue);
    setOrderHref(lastOrderIdValue ? `/order/${lastOrderIdValue}` : null);
  }, []);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, data?.status]);

  useEffect(() => {
    if (!data?.id) return;

    const isBankPayment = data.paymentMethod === "bank";
    const isPendingPayStatus = data.status === "created" || data.status === "pending_confirmation";

    if (isBankPayment && isPendingPayStatus) {
      setPendingPayOrderId(data.id);
      setActiveOrderId(data.id);
      setLastOrderId(data.id);
      setOrderHref(`/pay/${data.id}`);
      return;
    }

    clearPendingPayOrderId(data.id);
    if (isHistoryStatus(data.status)) {
      clearActiveOrderId(data.id);
    } else {
      setActiveOrderId(data.id);
    }
    setLastOrderId(data.id);
    setOrderHref(`/order/${data.id}`);
  }, [data?.id, data?.paymentMethod, data?.status]);

  useEffect(() => {
    const status = data?.status;
    if (!status) return;

    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;

    if (!prevStatus) return;

    if (status === "delivered" && prevStatus !== "delivered") {
      setShowDeliveredFx(true);
      const timer = setTimeout(() => setShowDeliveredFx(false), 2400);
      return () => clearTimeout(timer);
    }

    if (status === "canceled" && DELIVERY_WAIT_STATUSES.has(prevStatus)) {
      setShowCanceledFx(true);
      const timer = setTimeout(() => setShowCanceledFx(false), 2400);
      return () => clearTimeout(timer);
    }
  }, [data?.status]);

  useEffect(() => {
    const fallbackTimer = setInterval(() => void loadOrder(true), 5000);

    let es: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      es = new EventSource(`/api/orders/${orderId}/stream`);
      es.addEventListener("snapshot", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            order?: { id: string; status: string; updatedAt: string } | null;
          };
          if (payload?.order) {
            setOrderMissing(false);
            setData((prev) => {
              if (!prev || prev.id !== payload.order?.id) return prev;
              return {
                ...prev,
                status: payload.order.status,
                updatedAt: payload.order.updatedAt
              };
            });
            void loadOrder(true);
          } else {
            setData(null);
            setOrderMissing(true);
          }
        } catch {
          // ignore parse errors
        }
      });
      es.onerror = () => {
        // fallbackTimer keeps data fresh.
      };
    }

    return () => {
      clearInterval(fallbackTimer);
      if (es) es.close();
    };
  }, [loadOrder, orderId]);

  const statusMeta = useMemo(() => getOrderStatusMeta(data?.status ?? ""), [data?.status]);
  const menuSlug = data?.restaurant?.slug ?? history[0]?.restaurant?.slug ?? "dordoi-food";
  const isArchived = isHistoryStatus(data?.status ?? "");
  const hasNoActiveOrder = !orderLoading && (orderMissing || !data);

  return (
    <main className="min-h-screen p-5 pb-40">
      {showDeliveredFx && (
        <div className="delivered-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="delivered-card relative w-full max-w-sm overflow-hidden rounded-[28px] border border-emerald-200/80 bg-white/90 p-7 text-center shadow-[0_24px_70px_-24px_rgba(16,185,129,0.65)] backdrop-blur-xl">
            <div className="relative mx-auto h-24 w-24">
              <div className="delivered-check-ring absolute inset-0 rounded-full border-4 border-emerald-300/70" />
              <div className="delivered-check-core absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_12px_30px_-12px_rgba(5,150,105,0.85)]">
                <IconCheck className="h-8 w-8" />
              </div>
            </div>
            <div className="mt-4 text-[24px] font-extrabold leading-tight text-emerald-700">Р—Р°РєР°Р· РґРѕСЃС‚Р°РІР»РµРЅ</div>
            <div className="mt-1 text-sm font-semibold text-emerald-700/75">РџСЂРёСЏС‚РЅРѕРіРѕ Р°РїРїРµС‚РёС‚Р°!</div>

            <span className="delivered-dot delivered-dot-1" />
            <span className="delivered-dot delivered-dot-2" />
            <span className="delivered-dot delivered-dot-3" />
            <span className="delivered-dot delivered-dot-4" />
            <span className="delivered-dot delivered-dot-5" />
            <span className="delivered-dot delivered-dot-6" />
          </div>
        </div>
      )}

      {showCanceledFx && (
        <div className="canceled-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="canceled-card relative w-full max-w-sm overflow-hidden rounded-[28px] border border-rose-200/80 bg-white/90 p-7 text-center shadow-[0_24px_70px_-24px_rgba(244,63,94,0.62)] backdrop-blur-xl">
            <div className="relative mx-auto h-24 w-24">
              <div className="canceled-cross-ring absolute inset-0 rounded-full border-4 border-rose-300/75" />
              <div className="canceled-cross-core absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_12px_30px_-12px_rgba(225,29,72,0.8)]">
                <IconCross className="h-8 w-8" />
              </div>
            </div>
            <div className="mt-4 text-[24px] font-extrabold leading-tight text-rose-700">Р—Р°РєР°Р· РѕС‚РјРµРЅРµРЅ</div>
            <div className="mt-1 text-sm font-semibold text-rose-700/75">РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РѕС‚РјРµРЅРёР» Р·Р°РєР°Р·</div>

            <span className="canceled-dot canceled-dot-1" />
            <span className="canceled-dot canceled-dot-2" />
            <span className="canceled-dot canceled-dot-3" />
            <span className="canceled-dot canceled-dot-4" />
            <span className="canceled-dot canceled-dot-5" />
            <span className="canceled-dot canceled-dot-6" />
          </div>
        </div>
      )}

      <div className="mx-auto max-w-md space-y-4">
        <div className="text-3xl font-extrabold">Р—Р°РєР°Р·</div>

        {orderLoading && !data ? (
          <Card className="p-4">
            <div className="text-sm text-black/60">Р—Р°РіСЂСѓР·РєР° Р·Р°РєР°Р·Р°...</div>
          </Card>
        ) : hasNoActiveOrder ? (
          <Card className="p-4">
            <div className="text-sm text-black/60">РђРєС‚РёРІРЅС‹Р№ Р·Р°РєР°Р·</div>
            <div className="mt-2 text-sm text-black/70">РќРµС‚ Р°РєС‚РёРІРЅС‹С… Р·Р°РєР°Р·РѕРІ.</div>
            <div className="mt-3">
              <Link href={`/r/${menuSlug}`} className="block rounded-xl bg-black py-3 text-center font-semibold text-white">
                Р’ РјРµРЅСЋ
              </Link>
            </div>
          </Card>
        ) : !isArchived ? (
          <>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-3 border-b border-black/10 bg-white/75 px-4 py-3">
                <div className="text-sm font-semibold text-black/65">РђРєС‚РёРІРЅС‹Р№ Р·Р°РєР°Р·</div>
                <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${statusMeta.badgeClassName}`}>{statusMeta.label}</span>
              </div>

              <div className="p-4">
                <StatusProgress status={data?.status ?? ""} />

                <DeliveryTracker
                  status={data?.status ?? ""}
                  createdAt={data?.createdAt}
                  paymentConfirmedAt={data?.paymentConfirmedAt}
                  deliveredAt={data?.deliveredAt}
                />

                <div className="mt-4 rounded-2xl border border-black/10 bg-white/70 p-3">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div className="text-black/60">РС‚РѕРіРѕ</div>
                    <div className="text-right text-base font-extrabold">{formatKgs(data?.totalKgs ?? 0)}</div>
                    <div className="text-black/60">РџР»Р°С‚РµР»СЊС‰РёРє</div>
                    <div className="text-right font-bold break-words">{data?.payerName ?? "-"}</div>
                    <div className="text-black/60">РЎРїРѕСЃРѕР± РѕРїР»Р°С‚С‹</div>
                    <div className="text-right">{paymentMethodLabel(data?.paymentMethod ?? "")}</div>
                    <div className="text-black/60">РўРµР»РµС„РѕРЅ</div>
                    <div className="text-right">{data?.customerPhone ?? "-"}</div>
                    <div className="text-black/60">Р’СЂРµРјСЏ Р·Р°РєР°Р·Р°</div>
                    <div className="text-right">{data?.createdAt ? new Date(data.createdAt).toLocaleString() : "-"}</div>
                    <div className="text-black/60">РћР±РЅРѕРІР»РµРЅ</div>
                    <div className="text-right">{data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : "-"}</div>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-black/70">
                  РџСЂРѕС…РѕРґ <span className="font-bold">{data?.location?.line ?? "-"}</span>, РєРѕРЅС‚РµР№РЅРµСЂ <span className="font-bold">{data?.location?.container ?? "-"}</span>
                  {data?.location?.landmark ? <> ({data.location.landmark})</> : null}
                </div>
                {data?.comment ? <div className="mt-2 rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-black/60">РљРѕРјРјРµРЅС‚Р°СЂРёР№: {data.comment}</div> : null}
              </div>
            </Card>

            <div className="space-y-3">
              {(data?.items ?? []).map((it) => (
                <Card key={it.id} className="p-3">
                  <div className="flex gap-3">
                    <Photo src={it.photoUrl} alt={it.title} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 font-semibold break-words">{it.title}</div>
                        <div className="shrink-0 whitespace-nowrap font-bold">{formatKgs(it.priceKgs * it.qty)}</div>
                      </div>
                      <div className="mt-1 text-sm text-black/55">
                        {it.qty} x {formatKgs(it.priceKgs)}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <Card className="p-4">
            <div className="text-sm text-black/60">РђРєС‚РёРІРЅС‹Р№ Р·Р°РєР°Р·</div>
            <div className="mt-2 text-sm text-black/70">Р­С‚РѕС‚ Р·Р°РєР°Р· Р·Р°РІРµСЂС€РµРЅ Рё РїРµСЂРµРЅРµСЃРµРЅ РІ РёСЃС‚РѕСЂРёСЋ. РћС„РѕСЂРјРёС‚Рµ РЅРѕРІС‹Р№ Р·Р°РєР°Р· РІ РјРµРЅСЋ.</div>
            <div className="mt-3">
              <Link href={`/r/${menuSlug}`} className="block rounded-xl bg-black py-3 text-center font-semibold text-white">
                Р’ РјРµРЅСЋ
              </Link>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden p-0">
          <button className="flex w-full items-center justify-between px-4 py-4 text-left" onClick={() => setHistoryOpen((value) => !value)}>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <IconHistory className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold">РСЃС‚РѕСЂРёСЏ Р·Р°РєР°Р·РѕРІ</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-black/45">{history.length}</span>
              <IconChevron open={historyOpen} className="h-4 w-4 text-black/55" />
            </div>
          </button>

          {historyOpen && (
            <div className="border-t border-black/10 px-4 pb-4 pt-3">
              <div className="mb-2 text-[11px] text-black/45">РќР°Р¶РјРёС‚Рµ РЅР° Р·Р°РєР°Р·, С‡С‚РѕР±С‹ РїРѕСЃРјРѕС‚СЂРµС‚СЊ РґРµС‚Р°Р»Рё.</div>
              <div className="space-y-2">
                {history.map((order) => {
                  const isExpanded = openedHistoryOrderId === order.id;
                  const createdDate = new Date(order.createdAt);

                  return (
                    <div key={order.id} className="rounded-2xl border border-black/10 bg-white/70">
                      <button
                        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                        onClick={() => setOpenedHistoryOrderId((value) => (value === order.id ? null : order.id))}
                      >
                        <div className="w-6 shrink-0">{historyStatusIcon(order.status)}</div>
                        <div className="flex-1 text-center text-sm font-bold">{formatKgs(order.totalKgs)}</div>
                        <div className="w-32 shrink-0 text-right">
                          <div className="text-xs text-black/55">{createdDate.toLocaleDateString()}</div>
                          <div className="text-xs text-black/55">{createdDate.toLocaleTimeString()}</div>
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-black/45">
                            <span>{isExpanded ? "РЎРІРµСЂРЅСѓС‚СЊ" : "РџРѕРґСЂРѕР±РЅРµРµ"}</span>
                            <IconChevron open={isExpanded} className="h-3.5 w-3.5" />
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="motion-fade-up border-t border-black/10 px-3 pb-3 pt-2">
                          <div className="text-xs text-black/55">
                            {order.restaurant?.name ?? "-"} В· {paymentMethodLabel(order.paymentMethod)}
                          </div>
                          <div className="mt-1 text-xs text-black/55">
                            РџСЂРѕС…РѕРґ {order.location?.line ?? "-"}, РєРѕРЅС‚РµР№РЅРµСЂ {order.location?.container ?? "-"}
                          </div>
                          {order.comment ? <div className="mt-1 text-xs text-black/55">РљРѕРјРјРµРЅС‚Р°СЂРёР№: {order.comment}</div> : null}

                          <div className="mt-3 space-y-2">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-center gap-2 rounded-xl border border-black/10 bg-white/70 p-2">
                                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/5 ring-1 ring-black/5">
                                  <Image src={item.photoUrl} alt={item.title} fill className="object-cover" sizes="40px" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold">{item.title}</div>
                                  <div className="text-xs text-black/55">
                                    {item.qty} x {formatKgs(item.priceKgs)}
                                  </div>
                                </div>
                                <div className="text-sm font-bold">{formatKgs(item.priceKgs * item.qty)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {history.length === 0 && <div className="text-sm text-black/50">РСЃС‚РѕСЂРёСЏ Р·Р°РєР°Р·РѕРІ РїРѕРєР° РїСѓСЃС‚Р°.</div>}
              </div>
            </div>
          )}
        </Card>
      </div>

      <ClientNav menuHref={`/r/${menuSlug}`} orderHref={orderHref ?? (lastOrderId ? `/order/${lastOrderId}` : null)} />
    </main>
  );
}




