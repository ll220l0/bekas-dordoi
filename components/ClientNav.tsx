"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cartStore";
import { getActiveOrderId, getLastOrderId, getPendingPayOrderId } from "@/lib/clientPrefs";
import { isHistoryStatus } from "@/lib/orderStatus";

type Props = {
  menuHref: string;
  orderHref?: string | null;
};

function extractOrderId(href: string) {
  const match = href.match(/^\/(?:order|pay)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function getOrderDotColor(status: string | null) {
  switch (status) {
    case "confirmed":   return "bg-emerald-500";
    case "cooking":     return "bg-violet-500";
    case "delivering":  return "bg-sky-500";
    case "canceled":    return "bg-red-500";
    case "delivered":   return "bg-emerald-400";
    default:            return "bg-amber-400";
  }
}

function IconMenu() {
  return (
    <svg viewBox="0 0 22 22" className="h-[22px] w-[22px]" fill="none" aria-hidden="true">
      <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconCart({ count }: { count: number }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 22 22" className="h-[22px] w-[22px]" fill="none" aria-hidden="true">
        <path
          d="M2 3.5h2.5l2.2 8.5h9l1.8-6.5H6.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="17.5" r="1.3" fill="currentColor" />
        <circle cx="14.5" cy="17.5" r="1.3" fill="currentColor" />
      </svg>
      {count > 0 && (
        <span
          aria-label={`${count} товаров`}
          className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-black text-white"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </div>
  );
}

function IconOrder({ hasDot, dotColor }: { hasDot: boolean; dotColor: string }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 22 22" className="h-[22px] w-[22px]" fill="none" aria-hidden="true">
        <rect x="3.5" y="2" width="15" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.5 8h7M7.5 12h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {hasDot && (
        <span
          aria-hidden="true"
          className={clsx(
            "absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-stone-950",
            dotColor
          )}
        />
      )}
    </div>
  );
}

export function ClientNav({ menuHref, orderHref }: Props) {
  const pathname = usePathname();
  const lines = useCart((state) => state.lines);
  const cartCount = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines]);
  const [fallbackOrderHref, setFallbackOrderHref] = useState("/order");
  const [activeOrderStatus, setActiveOrderStatus] = useState<string | null>(null);

  const resolvedOrderHref = orderHref ?? fallbackOrderHref;

  useEffect(() => {
    if (orderHref) return;

    const syncOrderHref = () => {
      const pendingPayOrderId = getPendingPayOrderId();
      const activeOrderId = getActiveOrderId();
      const lastOrderId = getLastOrderId();
      setFallbackOrderHref(
        pendingPayOrderId
          ? `/pay/${pendingPayOrderId}`
          : activeOrderId
            ? `/order/${activeOrderId}`
            : lastOrderId
              ? `/order/${lastOrderId}`
              : "/order"
      );
    };

    syncOrderHref();
    const timer = window.setInterval(syncOrderHref, 1500);
    const onFocus = () => syncOrderHref();
    const onVisibility = () => { if (document.visibilityState === "visible") syncOrderHref(); };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "dordoi_pending_pay_order_id" || e.key === "dordoi_active_order_id") syncOrderHref();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [orderHref]);

  useEffect(() => {
    let stopped = false;
    const orderIdFromPath = extractOrderId(pathname);
    const orderId = orderIdFromPath ?? extractOrderId(resolvedOrderHref);

    if (!orderId) {
      setActiveOrderStatus(null);
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { status?: string };
        if (!stopped) setActiveOrderStatus(j.status ?? null);
      } catch { /* ignore */ }
    };

    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [pathname, resolvedOrderHref]);

  const hasActiveOrder = activeOrderStatus ? !isHistoryStatus(activeOrderStatus) : false;
  const orderDotColor = getOrderDotColor(activeOrderStatus);

  const isMenu  = pathname.startsWith("/r/");
  const isCart  = pathname === "/cart";
  const isOrder = pathname === "/order" || pathname.startsWith("/order/") || pathname.startsWith("/pay/");

  const tabClass = (active: boolean) =>
    clsx(
      "relative flex flex-col items-center gap-0.5 px-5 py-2 rounded-xl transition-colors duration-200",
      active ? "text-orange-500" : "text-stone-500 hover:text-stone-300"
    );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-stone-950 border-t border-stone-800/80 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around px-2">
        <Link href={menuHref} className={tabClass(isMenu)}>
          <IconMenu />
          <span className="text-[10px] font-semibold tracking-wide">Меню</span>
        </Link>

        <Link href="/cart" className={tabClass(isCart)}>
          <IconCart count={cartCount} />
          <span className="text-[10px] font-semibold tracking-wide">Корзина</span>
        </Link>

        <Link href={resolvedOrderHref} className={tabClass(isOrder)}>
          <IconOrder hasDot={hasActiveOrder} dotColor={orderDotColor} />
          <span className="text-[10px] font-semibold tracking-wide">Заказ</span>
        </Link>
      </div>
    </div>
  );
}
