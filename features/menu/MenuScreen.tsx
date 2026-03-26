"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ClientNav } from "@/components/ClientNav";
import { useCart } from "@/lib/cartStore";
import { formatKgs } from "@/lib/money";

type MenuResp = {
  restaurant: { id: string; name: string; slug: string };
  categories: { id: string; title: string; sortOrder: number }[];
  items: {
    id: string;
    categoryId: string;
    title: string;
    description: string;
    photoUrl: string;
    priceKgs: number;
    isAvailable: boolean;
  }[];
};

type MenuItem = MenuResp["items"][number];

async function fetchMenu(slug: string): Promise<MenuResp> {
  const res = await fetch(`/api/restaurants/${slug}/menu`, { cache: "no-store" });
  if (!res.ok) throw new Error("Не удалось загрузить меню");
  return res.json();
}

function clamp2(): CSSProperties {
  return { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };
}

function QtyStepper({ qty, onInc, onDec }: { qty: number; onInc: () => void; onDec: () => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-stone-800 border border-stone-700/80 px-1 py-1">
      <button
        type="button"
        onClick={onDec}
        className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:text-red-400 transition-colors text-base font-bold leading-none"
        aria-label="Уменьшить"
      >
        −
      </button>
      <span className="min-w-[1.8rem] text-center text-[14px] font-bold text-stone-100">{qty}</span>
      <button
        type="button"
        onClick={onInc}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-white text-base font-bold leading-none shadow-[0_3px_10px_rgba(249,115,22,0.4)] transition-all active:scale-90"
        aria-label="Увеличить"
      >
        +
      </button>
    </div>
  );
}

function SkeletonItem({ delay = 0 }: { delay?: number }) {
  return (
    <div className="flex gap-4 rounded-2xl bg-stone-900 p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="h-[88px] w-[88px] shrink-0 rounded-xl skeleton" />
      <div className="flex-1 space-y-2.5 pt-1">
        <div className="h-[15px] w-[65%] rounded-lg skeleton" />
        <div className="h-[13px] w-[80%] rounded-lg skeleton" />
        <div className="h-[13px] w-[50%] rounded-lg skeleton" />
        <div className="mt-4 flex items-center justify-between">
          <div className="h-5 w-20 rounded-lg skeleton" />
          <div className="h-9 w-9 rounded-full skeleton" />
        </div>
      </div>
    </div>
  );
}

function ItemModal({
  item, qty, onClose, onAdd, onInc, onDec
}: {
  item: MenuItem; qty: number; onClose: () => void;
  onAdd: () => void; onInc: () => void; onDec: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/70" aria-label="Закрыть" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-t-[28px] bg-stone-900 border-t border-x border-stone-800/80"
        style={{ animation: "modal-slide-up 280ms cubic-bezier(0.22,1,0.36,1)" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-stone-700" />
        </div>
        <div className="relative mx-4 mt-2 h-52 overflow-hidden rounded-2xl bg-stone-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.photoUrl} alt={item.title} className="h-full w-full object-cover" />
          {!item.isAvailable && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60">
              <span className="rounded-full bg-stone-900/90 px-4 py-2 text-sm font-semibold text-stone-300">Нет в наличии</span>
            </div>
          )}
        </div>
        <div className="px-4 pb-8 pt-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-black leading-tight text-stone-100 tracking-tight">{item.title}</h2>
            <div className="shrink-0 text-xl font-black text-amber-400">{formatKgs(item.priceKgs)}</div>
          </div>
          {item.description ? (
            <p className="mt-2 text-[14px] leading-relaxed text-stone-400">{item.description}</p>
          ) : null}
          <div className="mt-5">
            {!item.isAvailable ? (
              <div className="flex h-12 items-center justify-center rounded-2xl bg-stone-800 text-sm font-semibold text-stone-500">
                Нет в наличии
              </div>
            ) : qty > 0 ? (
              <div className="flex items-center justify-between gap-4">
                <QtyStepper qty={qty} onDec={onDec} onInc={onInc} />
                <button onClick={onClose} className="flex-1 rounded-2xl bg-orange-500 py-3.5 text-sm font-bold text-white shadow-[0_6px_20px_rgba(249,115,22,0.35)] active:scale-[0.98]">
                  Готово
                </button>
              </div>
            ) : (
              <button
                onClick={() => { onAdd(); }}
                className="w-full rounded-2xl bg-orange-500 py-4 text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(249,115,22,0.38)] active:scale-[0.98]"
              >
                + Добавить — {formatKgs(item.priceKgs)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MenuScreen({ slug }: { slug: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["menu", slug],
    queryFn: () => fetchMenu(slug),
    refetchInterval: 15000
  });

  const router = useRouter();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const catBarRef = useRef<HTMLDivElement>(null);

  const setRestaurant = useCart((s) => s.setRestaurant);
  const add   = useCart((s) => s.add);
  const inc   = useCart((s) => s.inc);
  const dec   = useCart((s) => s.dec);
  const lines = useCart((s) => s.lines);

  const effectiveSlug = data?.restaurant?.slug ?? slug;
  const cartCount = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);
  const cartTotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.priceKgs, 0), [lines]);

  useEffect(() => { setRestaurant(effectiveSlug); }, [effectiveSlug, setRestaurant]);

  useEffect(() => {
    if (data?.restaurant?.slug && data.restaurant.slug !== slug) {
      router.replace(`/r/${data.restaurant.slug}`);
    }
  }, [data?.restaurant?.slug, slug, router]);

  useEffect(() => {
    if (data?.categories?.length && !activeCat) setActiveCat(data.categories[0].id);
  }, [data?.categories, activeCat]);

  const qtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) map.set(l.menuItemId, l.qty);
    return map;
  }, [lines]);

  const items = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return data.items.filter(
        (item) => item.title.toLowerCase().includes(q) || (item.description ?? "").toLowerCase().includes(q)
      );
    }
    return activeCat ? data.items.filter((item) => item.categoryId === activeCat) : data.items;
  }, [data, activeCat, searchQuery]);

  function addToCart(item: MenuItem) {
    add({ menuItemId: item.id, title: item.title, photoUrl: item.photoUrl, priceKgs: item.priceKgs });
  }

  function handleCatClick(id: string) {
    setActiveCat(id);
    setSearchQuery("");
    const bar = catBarRef.current;
    if (!bar) return;
    const btn = bar.querySelector<HTMLElement>(`[data-catid="${id}"]`);
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  return (
    <main className="min-h-screen bg-stone-950 pb-[calc(57px+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-stone-950 border-b border-stone-800/60 px-4 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">
              {isLoading ? <span className="inline-block h-3 w-12 rounded skeleton" /> : "Меню"}
            </div>
            <h1 className="mt-1 text-[2.6rem] font-black leading-none tracking-[-0.03em] text-stone-100">
              {data?.restaurant?.name ?? (isLoading ? <span className="inline-block h-10 w-48 rounded-xl skeleton" /> : "—")}
            </h1>
          </div>
          {cartCount > 0 && (
            <div className="mt-2 shrink-0 rounded-full bg-orange-500/15 border border-orange-500/30 px-3 py-1 text-xs font-bold text-orange-400">
              {cartCount} шт
            </div>
          )}
        </div>

        <div className="relative mt-3.5">
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" fill="none">
            <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Найти блюдо..."
            className="w-full rounded-xl bg-stone-800 border border-stone-700/80 py-2.5 pl-10 pr-10 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/15 transition"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none"><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>

        {!searchQuery && (
          <div className="relative mt-3" ref={catBarRef}>
            <div className="no-scrollbar flex snap-x gap-2 overflow-x-auto pb-0.5">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 w-20 shrink-0 rounded-full skeleton" />)
                : (data?.categories ?? []).map((cat) => {
                    const active = cat.id === activeCat;
                    return (
                      <button
                        key={cat.id}
                        data-catid={cat.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => handleCatClick(cat.id)}
                        className={`shrink-0 snap-start rounded-full px-4 py-2 text-[13px] font-bold leading-none transition-all duration-200 ${
                          active
                            ? "bg-orange-500 text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]"
                            : "bg-stone-800 text-stone-400 border border-stone-700/80 hover:text-stone-200"
                        }`}
                      >
                        {cat.title}
                      </button>
                    );
                  })}
            </div>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="px-4 pt-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonItem key={i} delay={i * 60} />)
        ) : isError ? (
          <div className="mt-8 flex flex-col items-center text-center">
            <div className="text-4xl">😔</div>
            <div className="mt-3 font-bold text-stone-300">Не удалось загрузить меню</div>
            <div className="mt-1 text-sm text-stone-500">Проверьте соединение и обновите страницу</div>
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 flex flex-col items-center text-center">
            <div className="text-4xl">{searchQuery ? "🔍" : "🍽"}</div>
            <div className="mt-3 text-sm font-semibold text-stone-400">
              {searchQuery ? `Ничего по запросу «${searchQuery}»` : "В этой категории пока нет блюд"}
            </div>
          </div>
        ) : (
          items.map((item, index) => {
            const qty = qtyMap.get(item.id) ?? 0;
            return (
              <div
                key={item.id}
                className="motion-fade-up flex gap-4 rounded-2xl bg-stone-900 p-4 transition-colors duration-200 hover:bg-stone-800/60"
                style={{ animationDelay: `${Math.min(index * 45, 280)}ms` }}
              >
                <button type="button" onClick={() => setSelectedItem(item)} className="shrink-0 focus:outline-none" aria-label={`Подробнее: ${item.title}`}>
                  <div className="relative h-[88px] w-[88px] overflow-hidden rounded-xl bg-stone-800 transition-transform duration-200 active:scale-95">
                    <Image src={item.photoUrl} alt={item.title} fill className="object-cover" sizes="88px" />
                    {!item.isAvailable && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55">
                        <span className="text-[9px] font-bold text-stone-300 text-center leading-tight px-1">НЕТ В<br/>НАЛИЧИИ</span>
                      </div>
                    )}
                  </div>
                </button>

                <div className="flex min-w-0 flex-1 flex-col">
                  <button type="button" onClick={() => setSelectedItem(item)} className="min-w-0 text-left focus:outline-none">
                    <div className="text-[15px] font-bold leading-snug text-stone-100" style={{ ...clamp2(), WebkitLineClamp: 1 }}>
                      {item.title}
                    </div>
                    {item.description ? (
                      <div className="mt-1 text-[13px] leading-snug text-stone-500" style={clamp2()}>
                        {item.description}
                      </div>
                    ) : null}
                  </button>

                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="text-[16px] font-black text-amber-400">{formatKgs(item.priceKgs)}</div>
                    {item.isAvailable && (
                      qty > 0 ? (
                        <QtyStepper qty={qty} onDec={() => dec(item.id)} onInc={() => inc(item.id)} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(item)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-xl font-bold text-white shadow-[0_4px_14px_rgba(249,115,22,0.40)] hover:bg-orange-400 active:scale-90"
                          aria-label={`Добавить ${item.title}`}
                        >
                          +
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {cartCount > 0 && (
        <div className="cart-fab-enter fixed bottom-[calc(57px+env(safe-area-inset-bottom))] left-0 right-0 z-30 px-4">
          <Link
            href="/cart"
            className="flex h-14 items-center justify-between rounded-2xl bg-orange-500 px-4 shadow-[0_8px_32px_rgba(249,115,22,0.45)] hover:bg-orange-400 active:scale-[0.98]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/20 text-[13px] font-black text-white">{cartCount}</span>
            <span className="font-black tracking-[-0.01em] text-white">В корзину</span>
            <span className="text-[13px] font-bold text-white/80">{formatKgs(cartTotal)}</span>
          </Link>
        </div>
      )}

      <ClientNav menuHref={`/r/${effectiveSlug}`} />

      {selectedItem && (
        <ItemModal
          item={selectedItem}
          qty={qtyMap.get(selectedItem.id) ?? 0}
          onClose={() => setSelectedItem(null)}
          onAdd={() => addToCart(selectedItem)}
          onInc={() => inc(selectedItem.id)}
          onDec={() => dec(selectedItem.id)}
        />
      )}
    </main>
  );
}
