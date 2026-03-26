"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ClientNav } from "@/components/ClientNav";
import {
  clearActiveOrderId,
  clearPendingPayOrderId,
  getOrderHistoryEntry,
  getSavedPayerName,
  removeOrderFromHistory,
  setActiveOrderId,
  setPendingPayOrderId,
  setSavedPayerName
} from "@/lib/clientPrefs";
import { useCart } from "@/lib/cartStore";
import { buildMbankPayUrl, normalizeMbankNumber } from "@/lib/mbankLink";
import { formatKgs } from "@/lib/money";
import { isHistoryStatus } from "@/lib/orderStatus";

type OrderResp = {
  id: string;
  status: "created" | "pending_confirmation" | "confirmed" | "cooking" | "delivering" | "delivered" | "canceled";
  totalKgs: number;
  payerName?: string;
  restaurant: {
    name: string;
    slug: string;
    mbankNumber?: string;
  };
  items?: Array<{ qty: number; priceKgs: number }>;
};

const CONFIRMED_STATUSES = new Set<OrderResp["status"]>(["confirmed", "cooking", "delivering", "delivered"]);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error";
}

function getEffectiveTotalKgs(order: OrderResp | null, fallbackTotalKgs = 0) {
  if (!order) return fallbackTotalKgs;
  const apiTotal = Number(order.totalKgs);
  if (Number.isFinite(apiTotal) && apiTotal > 0) return Math.round(apiTotal);
  const lines = order.items ?? [];
  const computedFromItems = lines.reduce((sum, line) => {
    const qty = Number(line.qty);
    const priceKgs = Number(line.priceKgs);
    if (!Number.isFinite(qty) || !Number.isFinite(priceKgs)) return sum;
    return sum + Math.max(0, Math.round(qty)) * Math.max(0, Math.round(priceKgs));
  }, 0);
  if (computedFromItems > 0) return computedFromItems;
  return fallbackTotalKgs;
}

function IconCheck({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCross({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 7L17 17M17 7L7 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function PayScreen({ orderId }: { orderId: string }) {
  const [data, setData] = useState<OrderResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [navigatingToOrder, setNavigatingToOrder] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [waitingForAdmin, setWaitingForAdmin] = useState(false);
  const [showApprovedCheck, setShowApprovedCheck] = useState(false);
  const [showAdminCanceledFx, setShowAdminCanceledFx] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const prevStatusRef = useRef<OrderResp["status"] | null>(null);
  const cancelInitiatedByClientRef = useRef(false);
  const router = useRouter();
  const clearCart = useCart((state) => state.clear);

  const historyTotalKgs = useMemo(() => {
    const totalFromHistory = getOrderHistoryEntry(orderId)?.totalKgs ?? 0;
    const parsed = Number(totalFromHistory);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }, [orderId]);

  const effectiveTotalKgs = useMemo(() => getEffectiveTotalKgs(data, historyTotalKgs), [data, historyTotalKgs]);
  const mbankNumber = useMemo(() => normalizeMbankNumber(data?.restaurant?.mbankNumber), [data?.restaurant?.mbankNumber]);

  const resolvedBankUrl = useMemo(() => {
    if (effectiveTotalKgs <= 0) return null;
    return buildMbankPayUrl({ totalKgs: effectiveTotalKgs, bankPhone: mbankNumber });
  }, [effectiveTotalKgs, mbankNumber]);

  const isApproved = data ? CONFIRMED_STATUSES.has(data.status) : false;
  const isCanceled = data?.status === "canceled";

  useEffect(() => {
    setPendingPayOrderId(orderId);
    setActiveOrderId(orderId);
  }, [orderId]);

  useEffect(() => {
    let stopped = false;

    const loadOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (!res.ok) return;
        const response = (await res.json()) as OrderResp;
        if (!stopped) setData(response);
      } catch {
        // Ignore transient failures.
      }
    };

    void loadOrder();

    const fallbackTimer = window.setInterval(() => { void loadOrder(); }, 15000);

    let es: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      es = new EventSource(`/api/orders/${orderId}/stream`);
      es.addEventListener("snapshot", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            order?: { id: string; status: OrderResp["status"] } | null;
          };
          if (!stopped && payload?.order) {
            setData((prev) => {
              if (!prev || prev.id !== payload.order?.id) return prev;
              return { ...prev, status: payload.order.status };
            });
            void loadOrder();
          }
        } catch { /* noop */ }
      });
      es.onerror = () => { /* Fallback timer continues to work. */ };
    }

    return () => {
      stopped = true;
      window.clearInterval(fallbackTimer);
      if (es) es.close();
    };
  }, [orderId]);

  useEffect(() => {
    const savedName = getSavedPayerName().trim();
    if (savedName) setPayerName(savedName);
  }, []);

  useEffect(() => {
    if (data?.payerName && !payerName.trim()) {
      setPayerName(data.payerName);
    }
  }, [data?.payerName, payerName]);

  useEffect(() => {
    if (data?.status === "pending_confirmation") {
      setWaitingForAdmin(true);
    }
  }, [data?.status]);

  useEffect(() => {
    if (!isCanceled) return;
    clearCart();
    clearActiveOrderId(orderId);
    clearPendingPayOrderId(orderId);
    removeOrderFromHistory(orderId);
  }, [isCanceled, clearCart, orderId]);

  useEffect(() => {
    const status = data?.status;
    if (!status) return;
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== "canceled" || cancelInitiatedByClientRef.current) return;
    const canceledAfterPayment = prevStatus === "pending_confirmation" || (!!prevStatus && CONFIRMED_STATUSES.has(prevStatus));
    if (!canceledAfterPayment) return;
    setWaitingForAdmin(false);
    setShowApprovedCheck(false);
    setShowAdminCanceledFx(true);
  }, [data?.status]);

  useEffect(() => {
    if (!data) return;
    if (isHistoryStatus(data.status)) {
      clearActiveOrderId(orderId);
      return;
    }
    setActiveOrderId(orderId);
  }, [data, orderId]);

  useEffect(() => {
    if (!data) return;
    if (CONFIRMED_STATUSES.has(data.status) || data.status === "canceled") {
      clearPendingPayOrderId(orderId);
    }
  }, [data, orderId]);

  useEffect(() => {
    if (!isApproved) {
      setShowApprovedCheck(false);
      return;
    }
    const timer = window.setTimeout(() => setShowApprovedCheck(true), 120);
    return () => window.clearTimeout(timer);
  }, [isApproved]);

  useEffect(() => {
    if (!showAdminCanceledFx) return;
    const menuTarget = data?.restaurant?.slug ? `/r/${data.restaurant.slug}` : "/";
    const timer = window.setTimeout(() => { router.replace(menuTarget); }, 2300);
    return () => window.clearTimeout(timer);
  }, [showAdminCanceledFx, data?.restaurant?.slug, router]);

  useEffect(() => {
    if (!isApproved || !showApprovedCheck || navigatingToOrder) return;
    const timer = window.setTimeout(() => { openOrder(); }, 2000);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproved, showApprovedCheck, navigatingToOrder]);

  const menuHref = data?.restaurant?.slug ? `/r/${data.restaurant.slug}` : "/";

  function openOrder() {
    setNavigatingToOrder(true);
    window.setTimeout(() => { router.push(`/order/${orderId}`); }, 120);
  }

  async function markPaid() {
    const payer = payerName.trim();
    if (payer.length < 2) {
      toast.error("Укажи имя отправителя перевода");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/mark-paid`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payerName: payer })
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Ошибка");
      setSavedPayerName(payer);
      clearCart();
      setWaitingForAdmin(true);
      toast.success("Ожидаем подтверждения администратора");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function cancelOrder() {
    setCancelling(true);
    cancelInitiatedByClientRef.current = true;
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Не удалось отменить заказ");
      clearCart();
      clearActiveOrderId(orderId);
      clearPendingPayOrderId(orderId);
      removeOrderFromHistory(orderId);
      setWaitingForAdmin(false);
      setShowApprovedCheck(false);
      setData((prev) => (prev ? { ...prev, status: "canceled" } : prev));
      toast.success("Заказ отменен");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  const showCanceledCard = isCanceled && !isApproved && !showAdminCanceledFx;
  const showWaitingCard = waitingForAdmin && !isApproved && !showCanceledCard;
  const showPayCard = !showWaitingCard && !isApproved && !showCanceledCard;

  return (
    <main className="min-h-screen bg-stone-950 px-4 pb-[calc(57px+env(safe-area-inset-bottom))] pt-5">
      <div className="mx-auto max-w-md">

        {/* Header */}
        <div className="sticky top-0 z-30 bg-stone-950 border-b border-stone-800/60 px-4 pt-5 pb-4 -mx-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">Оплата</div>
          <h1 className="mt-1 text-[2.4rem] font-black tracking-[-0.03em] leading-none text-stone-100">
            {data?.restaurant?.name ?? "Банком"}
          </h1>
        </div>

        <div className="mt-4 space-y-3">

          {/* ── Pay card ── */}
          {showPayCard && (
            <div className="rounded-2xl bg-stone-900 border border-stone-800/80 overflow-hidden">
              {/* Amount row */}
              <div className="border-b border-stone-800 px-5 py-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">К оплате</div>
                <div className="mt-2 text-[3rem] font-black leading-none tracking-[-0.03em] text-stone-100">
                  {effectiveTotalKgs > 0 ? formatKgs(effectiveTotalKgs) : "—"}
                </div>
              </div>

              <div className="p-5 space-y-3">
                {/* Payer name input */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold text-stone-500">Имя отправителя перевода</label>
                  <input
                    className="w-full rounded-xl bg-stone-800 border border-stone-700/80 px-4 py-3 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/15 transition"
                    placeholder="Как вас зовут?"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-stone-500">Укажите имя, которое будет видно в переводе</p>
                </div>

                {/* Bank payment button */}
                {resolvedBankUrl ? (
                  <a
                    href={resolvedBankUrl}
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-base font-black tracking-wide text-white shadow-[0_8px_24px_rgba(5,150,105,0.35)] transition-all duration-200 hover:bg-emerald-500 active:scale-[0.98]"
                    aria-label="Перейти к оплате в банк"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                      <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
                      <path d="M2 10h20" stroke="currentColor" strokeWidth="2"/>
                      <path d="M6 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    Оплатить в банке
                  </a>
                ) : (
                  <div className="flex h-14 w-full items-center justify-center rounded-2xl border border-stone-700/80 bg-stone-800 text-sm font-semibold text-stone-500">
                    Банк не настроен
                  </div>
                )}

                {/* Confirm paid */}
                <button
                  onClick={() => void markPaid()}
                  disabled={loading || cancelling}
                  className="w-full rounded-2xl bg-stone-800 border border-stone-700 py-3.5 text-sm font-bold text-stone-300 transition-all duration-200 hover:bg-stone-700 hover:text-stone-100 disabled:opacity-50"
                >
                  {loading ? "Отправляем..." : "✅ Я оплатил(а)"}
                </button>

                {/* Cancel */}
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={loading || cancelling}
                  className="w-full rounded-2xl py-3 text-sm font-semibold text-red-400 transition-all duration-200 hover:text-red-300 disabled:opacity-40"
                >
                  {cancelling ? "Отменяем..." : "Отменить заказ"}
                </button>
              </div>
            </div>
          )}

          {/* ── Waiting card ── */}
          {showWaitingCard && (
            <div className="rounded-2xl bg-stone-900 border border-stone-800/80 p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative h-16 w-16">
                  <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  </div>
                </div>
                <div className="mt-4 text-lg font-black text-stone-100">Проверяем оплату</div>
                <div className="mt-1 text-sm text-stone-500">Ожидаем подтверждения администратора...</div>
              </div>
            </div>
          )}

          {/* ── Approved card ── */}
          {isApproved && (
            <div className="rounded-2xl bg-stone-900 border border-emerald-500/30 p-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_10px_24px_rgba(5,150,105,0.4)]">
                  <IconCheck className="h-7 w-7" />
                </div>
                <div className="mt-4 text-lg font-black text-emerald-400">Оплата подтверждена</div>
                <div className="mt-1 text-sm text-stone-500">Переходим к заказу...</div>
              </div>
            </div>
          )}

          {/* ── Canceled card ── */}
          {showCanceledCard && (
            <div className="rounded-2xl bg-stone-900 border border-red-500/30 p-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_10px_24px_rgba(239,68,68,0.4)]">
                  <IconCross className="h-7 w-7" />
                </div>
                <div className="mt-4 text-lg font-black text-red-400">Заказ отменен</div>
                <div className="mt-1 text-sm text-stone-500">Возвращаем в меню...</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ClientNav menuHref={menuHref} orderHref={`/pay/${orderId}`} />

      {/* Navigating overlay */}
      {navigatingToOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-2xl bg-stone-900 border border-stone-800 px-8 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <div className="mt-3 text-center text-sm font-semibold text-stone-300">Переходим к заказу...</div>
          </div>
        </div>
      )}

      {/* Admin canceled FX */}
      {showAdminCanceledFx && (
        <div className="canceled-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="canceled-card relative w-full max-w-sm overflow-hidden rounded-[28px] border border-red-500/30 bg-stone-900/95 p-7 text-center shadow-[0_24px_70px_-24px_rgba(239,68,68,0.5)]">
            <div className="relative mx-auto h-24 w-24">
              <div className="canceled-cross-ring absolute inset-0 rounded-full border-4 border-red-500/40" />
              <div className="canceled-cross-core absolute inset-[14px] flex items-center justify-center rounded-full bg-red-500 text-white shadow-[0_12px_30px_-12px_rgba(239,68,68,0.8)]">
                <IconCross className="h-8 w-8" />
              </div>
            </div>
            <div className="mt-4 text-[24px] font-black leading-tight text-red-400">Заказ отменен</div>
            <div className="mt-1 text-sm font-semibold text-red-400/70">Администратор отклонил оплату</div>
            <span className="canceled-dot canceled-dot-1" />
            <span className="canceled-dot canceled-dot-2" />
            <span className="canceled-dot canceled-dot-3" />
            <span className="canceled-dot canceled-dot-4" />
            <span className="canceled-dot canceled-dot-5" />
            <span className="canceled-dot canceled-dot-6" />
          </div>
        </div>
      )}

      {/* Cancel confirm modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <button className="absolute inset-0 bg-black/70" aria-label="Закрыть" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-[28px] border border-stone-700/80 bg-stone-900 p-6 shadow-[0_28px_60px_rgba(0,0,0,0.5)]">
            <div className="text-lg font-black text-stone-100">Отменить заказ?</div>
            <div className="mt-2 text-sm text-stone-500">Это действие нельзя отменить. Заказ будет удалён.</div>
            <div className="mt-5 flex gap-3">
              <button
                className="flex-1 rounded-2xl bg-stone-800 border border-stone-700 py-3 text-sm font-semibold text-stone-300 transition hover:bg-stone-700"
                onClick={() => setShowCancelConfirm(false)}
              >
                Назад
              </button>
              <button
                className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(239,68,68,0.3)] transition hover:bg-red-600"
                onClick={() => { setShowCancelConfirm(false); void cancelOrder(); }}
              >
                Да, отменить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approved FX */}
      {isApproved && showApprovedCheck && (
        <div className="approved-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="approved-card relative w-full max-w-sm overflow-hidden rounded-[30px] border border-emerald-500/30 bg-stone-900/95 p-7 text-center shadow-[0_28px_75px_-26px_rgba(16,185,129,0.5)]">
            <div className="approved-shine absolute inset-x-[-24%] top-0 h-16 -rotate-6 bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
            <div className="relative mx-auto h-24 w-24">
              <div className="approved-ring absolute inset-0 rounded-full border-4 border-emerald-500/40" />
              <div className="approved-core absolute inset-[14px] flex items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_14px_34px_-14px_rgba(5,150,105,0.9)]">
                <IconCheck className="h-8 w-8" />
              </div>
            </div>
            <div className="mt-4 text-[24px] font-black leading-tight text-emerald-400">Оплата подтверждена</div>
            <div className="mt-1 text-sm font-semibold text-emerald-400/70">Заказ принят в работу</div>
            <span className="approved-dot approved-dot-1" />
            <span className="approved-dot approved-dot-2" />
            <span className="approved-dot approved-dot-3" />
            <span className="approved-dot approved-dot-4" />
            <span className="approved-dot approved-dot-5" />
            <span className="approved-dot approved-dot-6" />
          </div>
        </div>
      )}
    </main>
  );
}
