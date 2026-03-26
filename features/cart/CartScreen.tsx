"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ClientNav } from "@/components/ClientNav";
import { useCart } from "@/lib/cartStore";
import {
  addOrderToHistory,
  setActiveOrderId,
  clearPendingPayOrderId,
  getOrderHistory,
  getSavedLocation,
  getSavedPhone,
  setSavedLocation,
  setPendingPayOrderId,
  setSavedPhone,
  getSavedAddresses,
  addSavedAddress,
} from "@/lib/clientPrefs";
import { formatKgs } from "@/lib/money";

type PaymentMethod = "bank" | "cash";
type CreateOrderResponse = { orderId: string; bankPayUrl?: string | null };

function getErrorMessage(e: unknown) { return e instanceof Error ? e.message : "Ошибка"; }

function normalizeKgPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const rest = digits.startsWith("996") ? digits.slice(3) : digits;
  const normalized = `996${rest}`.slice(0, 12);
  return /^996\d{9}$/.test(normalized) ? normalized : null;
}

function formatKgPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const rest = digits.startsWith("996") ? digits.slice(3) : digits;
  const normalized = `996${rest}`.slice(0, 12);
  const local = normalized.slice(3);
  if (local.length === 0) return "996";
  if (local.length <= 3) return `996 (${local}`;
  if (local.length <= 6) return `996 (${local.slice(0, 3)}) ${local.slice(3)}`;
  return `996 (${local.slice(0, 3)}) ${local.slice(3, 6)} - ${local.slice(6, 9)}`;
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

const inputClass = "w-full rounded-xl bg-stone-800 border border-stone-700/80 px-4 py-3 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/15 transition";

export default function CartScreen() {
  const restaurantSlug = useCart((s) => s.restaurantSlug);
  const lines = useCart((s) => s.lines);
  const total = useCart((s) => s.total());
  const count = useCart((s) => s.count());
  const setLines = useCart((s) => s.setLines);
  const inc = useCart((s) => s.inc);
  const dec = useCart((s) => s.dec);
  const clear = useCart((s) => s.clear);

  const [line, setLine] = useState("");
  const [container, setContainer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [comment, setComment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank");
  const [loading, setLoading] = useState(false);
  const [redirectingTo, setRedirectingTo] = useState<"pay" | "order" | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<Array<{ line: string; container: string }>>([]);
  const submitLockRef = useRef(false);

  useEffect(() => {
    setIsHydrated(true);
    setIdempotencyKey(createIdempotencyKey());
    setCustomerPhone(formatKgPhone(getSavedPhone()));
    const savedLocation = getSavedLocation();
    setLine(savedLocation.line);
    setContainer(savedLocation.container);
    setSavedAddresses(getSavedAddresses());
  }, []);

  const requestSignature = useMemo(() =>
    JSON.stringify({ restaurantSlug, lines: lines.map((x) => ({ id: x.menuItemId, qty: x.qty })), line: line.trim(), container: container.trim(), customerPhone: normalizeKgPhone(customerPhone.trim()) ?? "", paymentMethod, comment: comment.trim() }),
    [restaurantSlug, lines, line, container, customerPhone, paymentMethod, comment]
  );

  useEffect(() => { if (!isHydrated) return; setIdempotencyKey(createIdempotencyKey()); }, [isHydrated, requestSignature]);

  const canSubmit = useMemo(() =>
    Boolean(isHydrated && restaurantSlug && lines.length > 0 && line.trim().length > 0 && container.trim().length > 0 && Boolean(normalizeKgPhone(customerPhone)) && !loading),
    [container, customerPhone, isHydrated, line, lines.length, loading, restaurantSlug]
  );

  const lastOrderSuggestion = useMemo(() => {
    if (!isHydrated) return null;
    const latest = getOrderHistory()[0];
    if (!latest?.restaurantSlug || !Array.isArray(latest.lines)) return null;
    const normalizedLines = latest.lines.map((item) => ({ menuItemId: item.menuItemId ?? "", title: item.title, photoUrl: item.photoUrl, priceKgs: item.priceKgs, qty: item.qty })).filter((item) => item.menuItemId.length > 0 && item.qty > 0);
    if (normalizedLines.length === 0) return null;
    return { ...latest, lines: normalizedLines };
  }, [isHydrated]);

  const menuHref = restaurantSlug ? `/r/${restaurantSlug}` : "/";

  if (!isHydrated) {
    return (
      <main className="min-h-screen bg-stone-950 px-4 pb-[calc(57px+env(safe-area-inset-bottom))] pt-5">
        <div className="mx-auto max-w-md space-y-3">
          <div className="h-10 w-32 rounded-xl skeleton" />
          <div className="h-24 rounded-2xl skeleton" />
        </div>
      </main>
    );
  }

  async function submitOrder() {
    if (!restaurantSlug || lines.length === 0) { toast.error("Корзина пуста"); return; }
    const phone = normalizeKgPhone(customerPhone.trim());
    if (!line.trim() || !container.trim()) { toast.error("Заполни проход и контейнер"); return; }
    if (!phone) { toast.error("Укажи телефон в формате 996 (xxx) xxx - xxx"); return; }
    if (submitLockRef.current || loading) return;
    submitLockRef.current = true;
    setLoading(true);
    try {
      const payload = { restaurantSlug, paymentMethod, customerPhone: phone, comment: comment.trim(), location: { line: line.trim(), container: container.trim() }, items: lines.map((x) => ({ menuItemId: x.menuItemId, qty: x.qty })), idempotencyKey };
      const res = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json", "x-idempotency-key": idempotencyKey }, body: JSON.stringify(payload) });
      const j = (await res.json().catch(() => null)) as Partial<CreateOrderResponse> & { error?: string } | null;
      if (!res.ok || !j?.orderId) throw new Error(j?.error ?? "Не удалось создать заказ");
      setIdempotencyKey(createIdempotencyKey());
      addOrderToHistory({ orderId: j.orderId, restaurantSlug, customerPhone: phone, totalKgs: total, createdAt: new Date().toISOString(), lines });
      setActiveOrderId(j.orderId);
      setSavedPhone(phone);
      setSavedLocation({ line: line.trim(), container: container.trim() });
      addSavedAddress({ line: line.trim(), container: container.trim() });
      clear();
      if (paymentMethod === "bank") { setPendingPayOrderId(j.orderId); } else { clearPendingPayOrderId(); }
      const nextUrl = paymentMethod === "bank" ? `/pay/${j.orderId}` : `/order/${j.orderId}`;
      setRedirectingTo(paymentMethod === "bank" ? "pay" : "order");
      window.setTimeout(() => { window.location.assign(nextUrl); }, 180);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  }

  // ── Empty cart ──────────────────────────────────────────────────
  if (lines.length === 0) {
    function repeatLastOrder() {
      if (!lastOrderSuggestion) return;
      setLines(lastOrderSuggestion.restaurantSlug, lastOrderSuggestion.lines);
      if (lastOrderSuggestion.customerPhone) { setSavedPhone(lastOrderSuggestion.customerPhone.replace(/\D/g, "")); setCustomerPhone(formatKgPhone(lastOrderSuggestion.customerPhone)); }
      toast.success("Последний заказ добавлен в корзину");
    }

    return (
      <main className="min-h-screen bg-stone-950 px-4 pb-[calc(57px+env(safe-area-inset-bottom))] pt-5">
        <div className="mx-auto max-w-md">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">Корзина</div>
          <h1 className="mt-1 text-[2.4rem] font-black tracking-[-0.03em] leading-none text-stone-100">Пусто</h1>

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl bg-stone-900 border border-stone-800/80 p-5 text-center">
              <div className="text-4xl">🛒</div>
              <div className="mt-3 font-bold text-stone-200">В корзине ничего нет</div>
              <div className="mt-1 text-sm text-stone-500">Выберите блюда из меню</div>
              <Link href={menuHref} className="mt-5 block rounded-xl bg-orange-500 py-3.5 text-center text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(249,115,22,0.35)]">
                Перейти в меню
              </Link>
            </div>

            {lastOrderSuggestion && (
              <div className="rounded-2xl bg-stone-900 border border-stone-800/80 overflow-hidden">
                <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-500">Прошлый заказ</div>
                  <div className="text-sm font-black text-amber-400">{formatKgs(lastOrderSuggestion.totalKgs)}</div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {lastOrderSuggestion.lines.map((item) => (
                    <div key={`${item.menuItemId}-${item.title}`} className="flex items-center gap-3 rounded-xl bg-stone-800/60 p-2.5">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-stone-700">
                        <Image src={item.photoUrl} alt={item.title} fill className="object-cover" sizes="40px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-stone-200">{item.title}</div>
                        <div className="text-xs text-stone-500">{item.qty} × {formatKgs(item.priceKgs)}</div>
                      </div>
                      <div className="text-sm font-bold text-stone-300">{formatKgs(item.priceKgs * item.qty)}</div>
                    </div>
                  ))}
                </div>
                <div className="px-4 pb-4">
                  <button
                    onClick={repeatLastOrder}
                    className="w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-[0_6px_20px_rgba(249,115,22,0.32)] active:scale-[0.98]"
                  >
                    Повторить заказ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <ClientNav menuHref={menuHref} />
      </main>
    );
  }

  // ── Filled cart ─────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-stone-950 px-4 pb-[calc(57px+env(safe-area-inset-bottom))] pt-5">
      <div className="mx-auto max-w-md space-y-4">

        {/* Header */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">Оформление</div>
          <div className="flex items-end justify-between gap-2 mt-1">
            <h1 className="text-[2.4rem] font-black tracking-[-0.03em] leading-none text-stone-100">Корзина</h1>
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full bg-orange-500/15 border border-orange-500/30 px-3 py-1 text-xs font-bold text-orange-400">{count} шт</span>
              <Link href={menuHref} className="rounded-full bg-stone-800 border border-stone-700 px-3 py-1 text-xs font-semibold text-stone-400 hover:text-stone-200">В меню</Link>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2.5">
          {lines.map((lineItem) => (
            <div key={lineItem.menuItemId} className="flex gap-3.5 rounded-2xl bg-stone-900 border border-stone-800/80 p-3.5">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-800">
                <Image src={lineItem.photoUrl} alt={lineItem.title} fill className="object-cover" sizes="64px" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[14px] font-semibold leading-snug text-stone-100">{lineItem.title}</div>
                  <div className="shrink-0 text-[14px] font-black text-amber-400">{formatKgs(lineItem.priceKgs * lineItem.qty)}</div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-[12px] text-stone-500">{formatKgs(lineItem.priceKgs)} × {lineItem.qty}</div>
                  <div className="flex items-center gap-1 rounded-full bg-stone-800 border border-stone-700/80 px-1 py-1">
                    <button type="button" onClick={() => dec(lineItem.menuItemId)} className="flex h-6 w-6 items-center justify-center rounded-full text-stone-400 hover:text-red-400 font-bold text-sm">−</button>
                    <span className="min-w-[1.5rem] text-center text-[13px] font-bold text-stone-100">{lineItem.qty}</span>
                    <button type="button" onClick={() => inc(lineItem.menuItemId)} className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white font-bold text-sm active:scale-90">+</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Delivery form */}
        <div className="rounded-2xl bg-stone-900 border border-stone-800/80 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-stone-800 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-500">Куда доставить</div>
          </div>
          <div className="p-4 space-y-3">
            {savedAddresses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {savedAddresses.map((addr, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setLine(addr.line); setContainer(addr.container); }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${
                      addr.line === line && addr.container === container
                        ? "bg-orange-500 border-orange-500 text-white shadow-[0_3px_10px_rgba(249,115,22,0.3)]"
                        : "bg-stone-800 border-stone-700 text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    {addr.line ? `Пр.${addr.line}` : ""}{addr.line && addr.container ? ", " : ""}{addr.container ? `К.${addr.container}` : ""}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-stone-500">Проход</label>
                <input className={inputClass} placeholder="Напр. 12" value={line} onChange={(e) => setLine(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-stone-500">Контейнер</label>
                <input className={inputClass} placeholder="Напр. А-15" value={container} onChange={(e) => setContainer(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-stone-500">Телефон</label>
              <input className={inputClass} placeholder="996 (___) ___ - ___" value={customerPhone} onChange={(e) => setCustomerPhone(formatKgPhone(e.target.value))} inputMode="tel" required />
            </div>
          </div>
        </div>

        {/* Comment */}
        <div className="rounded-2xl bg-stone-900 border border-stone-800/80 overflow-hidden">
          <div className="border-b border-stone-800 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-500">Комментарий</div>
          </div>
          <div className="p-4">
            <textarea
              className={`${inputClass} resize-none`}
              placeholder="Без лука, острее, оставить у охраны..."
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </div>

        {/* Payment */}
        <div className="rounded-2xl bg-stone-900 border border-stone-800/80 overflow-hidden">
          <div className="border-b border-stone-800 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-500">Способ оплаты</div>
          </div>
          <div className="flex gap-2 p-4">
            {(["bank", "cash"] as const).map((method) => {
              const active = paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`flex flex-1 flex-col items-start rounded-xl border p-3 text-left transition-all duration-200 ${
                    active ? "border-orange-500/50 bg-orange-500/10" : "border-stone-700/80 bg-stone-800/60 hover:bg-stone-800"
                  }`}
                >
                  <div className={`text-[15px] font-black ${active ? "text-orange-400" : "text-stone-300"}`}>
                    {method === "bank" ? "💳 Банком" : "💵 Наличными"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-stone-500">
                    {method === "bank" ? "Mbank, OBANK, Bakai" : "Курьеру при доставке"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary + CTA */}
        <div className="rounded-2xl bg-stone-900 border border-stone-800/80 overflow-hidden">
          <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
            <div className="text-sm text-stone-400">{count} позиц.</div>
            <div className="text-[1.6rem] font-black tracking-tight text-stone-100">{formatKgs(total)}</div>
          </div>
          <div className="space-y-2 p-4">
            <button
              onClick={() => void submitOrder()}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-orange-500 py-4 text-[15px] font-black text-white shadow-[0_8px_24px_rgba(249,115,22,0.38)] transition-all duration-200 hover:bg-orange-400 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
            >
              {loading ? "Создаем заказ..." : paymentMethod === "bank" ? "К оплате →" : "Оформить заказ →"}
            </button>
            <button
              onClick={() => { if (loading) return; clear(); toast.success("Корзина очищена"); }}
              disabled={loading}
              className="w-full rounded-xl bg-stone-800 border border-stone-700 py-3 text-sm font-semibold text-stone-400 hover:text-stone-200 hover:bg-stone-700 transition-all disabled:opacity-40"
            >
              Очистить корзину
            </button>
          </div>
        </div>
      </div>

      <ClientNav menuHref={menuHref} />

      {redirectingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-2xl bg-stone-900 border border-stone-800 px-8 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <div className="mt-3 text-center text-sm font-semibold text-stone-300">
              {redirectingTo === "pay" ? "Открываем оплату..." : "Переходим к заказу..."}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
