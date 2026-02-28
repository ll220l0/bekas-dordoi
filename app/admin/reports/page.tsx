"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { Card } from "@/components/ui";
import { formatKgs } from "@/lib/money";

type DailyRow = {
  date: string;
  orders: number;
  delivered: number;
  canceled: number;
  revenueKgs: number;
  avgCheckKgs: number;
};

type ReportResp = {
  summary: {
    totalRevenueKgs: number;
    totalOrders: number;
    totalDelivered: number;
    totalCanceled: number;
    avgCheckKgs: number;
  };
  slo: {
    paymentConfirm: {
      sampleSize: number;
      targetMinutes: number;
      p50Minutes: number;
      p90Minutes: number;
      withinTargetPct: number;
    };
    delivery: {
      sampleSize: number;
      targetMinutes: number;
      p50Minutes: number;
      p90Minutes: number;
      withinTargetPct: number;
    };
    cancelRatePct: number;
    staleAwaitingPayment: number;
  };
  daily: DailyRow[];
  topItems: Array<{ title: string; qty: number; revenueKgs: number }>;
};

type AuditRow = {
  id: string;
  action: string;
  actor: string;
  actorRole: string;
  createdAt: string;
  orderId?: string | null;
};

type Point = {
  x: number;
  y: number;
};

type RevenuePoint = Point & {
  date: string;
  orders: number;
  delivered: number;
  canceled: number;
  revenueKgs: number;
  avgCheckKgs: number;
  barY: number;
  barHeight: number;
};

function buildSmoothPath(points: Point[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

function TinySparkline({ values, stroke, fill, baseline = 0 }: { values: number[]; stroke: string; fill: string; baseline?: number }) {
  const width = 136;
  const height = 46;
  const padding = 4;

  const normalizedValues = values.length > 0 ? values : [baseline, baseline, baseline];
  const minV = Math.min(...normalizedValues, baseline);
  const maxV = Math.max(...normalizedValues, baseline + 1);
  const range = Math.max(1, maxV - minV);

  const points = normalizedValues.map((value, idx) => {
    const x = padding + ((width - padding * 2) * idx) / Math.max(1, normalizedValues.length - 1);
    const y = padding + (height - padding * 2) * (1 - (value - minV) / range);
    return { x, y };
  });

  const linePath = buildSmoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${linePath} L ${last.x} ${height - padding} L ${first.x} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-full overflow-visible">
      <defs>
        <linearGradient id={`spark-fill-${stroke.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.36" />
          <stop offset="100%" stopColor={fill} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-fill-${stroke.replace(/[^a-z0-9]/gi, "")})`} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function KpiCard({
  label,
  value,
  values,
  stroke,
  fill,
  accent
}: {
  label: string;
  value: string | number;
  values: number[];
  stroke: string;
  fill: string;
  accent: string;
}) {
  return (
    <Card className="relative overflow-hidden border border-black/10 bg-white/85 p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.42)] backdrop-blur">
      <div className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full ${accent}`} />
      <div className="relative">
        <div className="text-[11px] uppercase tracking-[0.12em] text-black/45">{label}</div>
        <div className="mt-1 text-2xl font-extrabold text-black/90">{value}</div>
        <div className="mt-2">
          <TinySparkline values={values} stroke={stroke} fill={fill} baseline={0} />
        </div>
      </div>
    </Card>
  );
}

function RevenueTrendChart({ rows }: { rows: DailyRow[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(rows.length > 0 ? rows.length - 1 : 0);
  }, [rows.length]);

  const chart = useMemo(() => {
    const width = 840;
    const height = 290;
    const paddingX = 40;
    const paddingTop = 20;
    const paddingBottom = 46;
    const innerWidth = width - paddingX * 2;
    const innerHeight = height - paddingTop - paddingBottom;

    const maxRevenue = Math.max(1, ...rows.map((row) => row.revenueKgs));
    const maxOrders = Math.max(1, ...rows.map((row) => row.orders));
    const denominator = Math.max(1, rows.length - 1);

    const points: RevenuePoint[] = rows.map((row, idx) => {
      const x = paddingX + (innerWidth * idx) / denominator;
      const y = paddingTop + innerHeight - (row.revenueKgs / maxRevenue) * innerHeight;
      const barHeight = (row.orders / maxOrders) * innerHeight;
      return {
        ...row,
        x,
        y,
        barY: paddingTop + innerHeight - barHeight,
        barHeight
      };
    });

    const linePath = buildSmoothPath(points);
    const first = points[0];
    const last = points[points.length - 1];
    const areaPath =
      points.length > 0
        ? `${linePath} L ${last.x.toFixed(1)} ${(paddingTop + innerHeight).toFixed(1)} L ${first.x.toFixed(1)} ${(paddingTop + innerHeight).toFixed(1)} Z`
        : "";

    return {
      width,
      height,
      paddingX,
      paddingTop,
      paddingBottom,
      innerWidth,
      innerHeight,
      points,
      linePath,
      areaPath
    };
  }, [rows]);

  const activePoint = chart.points[Math.min(activeIndex, Math.max(0, chart.points.length - 1))] ?? null;

  return (
    <Card className="overflow-hidden border border-black/10 bg-white/88 p-0 shadow-[0_26px_60px_-36px_rgba(15,23,42,0.5)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
        <div className="text-sm font-semibold text-black/80">РўСЂРµРЅРґ РІС‹СЂСѓС‡РєРё</div>
        <div className="hidden text-xs text-black/50 sm:block">РќР°РІРµРґРёС‚Рµ РЅР° С‚РѕС‡РєСѓ</div>
      </div>

      <div className="px-4 pb-4 pt-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4 text-sm text-black/55">РќРµС‚ РґР°РЅРЅС‹С… Р·Р° РІС‹Р±СЂР°РЅРЅС‹Р№ РїРµСЂРёРѕРґ.</div>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto px-1">
              <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-56 w-[720px] overflow-visible sm:h-64 sm:w-full">
              <defs>
                <linearGradient id="reports-revenue-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0891b2" stopOpacity="0.33" />
                  <stop offset="100%" stopColor="#0891b2" stopOpacity="0.04" />
                </linearGradient>
                <linearGradient id="reports-orders-bars" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.34" />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.08" />
                </linearGradient>
              </defs>

              {[0, 1, 2, 3, 4].map((step) => {
                const y = chart.paddingTop + (chart.innerHeight * step) / 4;
                return <line key={step} x1={chart.paddingX} x2={chart.width - chart.paddingX} y1={y} y2={y} stroke="rgba(15,23,42,0.08)" strokeDasharray="4 8" />;
              })}

              {chart.points.map((point, idx) => {
                const next = chart.points[idx + 1];
                const barWidth = next ? Math.max(8, next.x - point.x - 10) : 12;
                return (
                  <rect
                    key={`bar-${point.date}`}
                    x={point.x - barWidth / 2}
                    y={point.barY}
                    width={barWidth}
                    height={point.barHeight}
                    rx={7}
                    fill={idx === activeIndex ? "rgba(14,165,233,0.48)" : "url(#reports-orders-bars)"}
                  />
                );
              })}

              {chart.areaPath ? <path d={chart.areaPath} fill="url(#reports-revenue-area)" /> : null}
              {chart.linePath ? <path d={chart.linePath} fill="none" stroke="#0284c7" strokeWidth="2.35" strokeLinecap="round" /> : null}

              {chart.points.map((point, idx) => (
                <g key={`point-${point.date}`} onMouseEnter={() => setActiveIndex(idx)} onFocus={() => setActiveIndex(idx)}>
                  <circle cx={point.x} cy={point.y} r={idx === activeIndex ? 7 : 5} fill={idx === activeIndex ? "#0ea5e9" : "#7dd3fc"} />
                  {idx === activeIndex ? <circle cx={point.x} cy={point.y} r="11" fill="none" stroke="#0ea5e9" strokeOpacity="0.24" strokeWidth="6" /> : null}
                </g>
              ))}
            </svg>
            </div>

            {activePoint ? (
              <div className="mt-3 rounded-2xl border border-black/10 bg-gradient-to-r from-cyan-50/80 via-white to-sky-50/80 p-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-black/85">{activePoint.date}</div>
                  <div className="text-base font-extrabold text-black/90">{formatKgs(activePoint.revenueKgs)}</div>
                </div>
                <div className="mt-1 text-xs text-black/60">
                  Р—Р°РєР°Р·С‹: {activePoint.orders} В· Р”РѕСЃС‚Р°РІР»РµРЅРѕ: {activePoint.delivered} В· РћС‚РјРµРЅРµРЅРѕ: {activePoint.canceled} В· РЎСЂРµРґРЅРёР№ С‡РµРє: {formatKgs(activePoint.avgCheckKgs)}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function ConversionDonut({ summary }: { summary: ReportResp["summary"] | null | undefined }) {
  const rawTotal = Math.max(0, summary?.totalOrders ?? 0);
  const safeDelivered = Math.max(0, summary?.totalDelivered ?? 0);
  const safeCanceled = Math.max(0, summary?.totalCanceled ?? 0);
  const normalizedTotal = Math.max(rawTotal, safeDelivered + safeCanceled);
  const safePending = Math.max(0, normalizedTotal - safeDelivered - safeCanceled);
  const totalSafe = safeDelivered + safePending + safeCanceled;

  const deliveredPct = totalSafe > 0 ? (safeDelivered / totalSafe) * 100 : 0;
  const pendingPct = totalSafe > 0 ? (safePending / totalSafe) * 100 : 0;
  const splitA = Math.max(0, Math.min(100, deliveredPct));
  const splitB = Math.max(splitA, Math.min(100, deliveredPct + pendingPct));

  const conicGradient =
    totalSafe > 0
      ? `conic-gradient(from -90deg, #10b981 0% ${splitA}%, #0ea5e9 ${splitA}% ${splitB}%, #f43f5e ${splitB}% 100%)`
      : "conic-gradient(from -90deg, rgba(15,23,42,0.08) 0% 100%)";

  return (
    <Card className="overflow-hidden border border-black/10 bg-white/88 p-0 shadow-[0_26px_60px_-36px_rgba(15,23,42,0.5)] backdrop-blur">
      <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold text-black/80">РљРѕРЅРІРµСЂСЃРёСЏ Р·Р°РєР°Р·РѕРІ</div>
      <div className="grid gap-3 px-4 pb-4 pt-4 sm:grid-cols-[160px_1fr] sm:items-center">
        <div className="mx-auto">
          <div className="relative h-32 w-32 rounded-full sm:h-[150px] sm:w-[150px]" style={{ background: conicGradient }}>
            <div className="absolute inset-[14px] rounded-full bg-white/95 ring-1 ring-black/5 sm:inset-[16px]" />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/45">{"\u0412\u0441\u0435\u0433\u043e"}</div>
              <div className="text-[24px] font-extrabold text-black sm:text-[26px]">{totalSafe}</div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm">
            <div className="font-semibold text-emerald-700">Р”РѕСЃС‚Р°РІР»РµРЅРѕ</div>
            <div className="text-xs text-emerald-700/80">
              {safeDelivered} Р·Р°РєР°Р·РѕРІ В· {totalSafe > 0 ? Math.round((safeDelivered / totalSafe) * 100) : 0}%
            </div>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm">
            <div className="font-semibold text-sky-700">Р’ СЂР°Р±РѕС‚Рµ</div>
            <div className="text-xs text-sky-700/80">
              {safePending} Р·Р°РєР°Р·РѕРІ В· {totalSafe > 0 ? Math.round((safePending / totalSafe) * 100) : 0}%
            </div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm">
            <div className="font-semibold text-rose-700">РћС‚РјРµРЅРµРЅРѕ</div>
            <div className="text-xs text-rose-700/80">
              {safeCanceled} Р·Р°РєР°Р·РѕРІ В· {totalSafe > 0 ? Math.round((safeCanceled / totalSafe) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SloGauge({
  title,
  value,
  target,
  p50,
  p90,
  sample,
  color,
  tone
}: {
  title: string;
  value: number;
  target: number;
  p50: number;
  p90: number;
  sample: number;
  color: string;
  tone: string;
}) {
  const percent = Math.max(0, Math.min(100, value));
  const gradient = `conic-gradient(from -90deg, ${color} 0% ${percent}%, rgba(148,163,184,0.18) ${percent}% 100%)`;

  return (
    <div className="rounded-2xl border border-black/10 bg-white/90 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-black/80">{title}</div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{value}%</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="relative h-16 w-16 shrink-0 rounded-full" style={{ background: gradient }}>
          <div className="absolute inset-[7px] rounded-full bg-white ring-1 ring-black/5" />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-black/75">{value}%</div>
        </div>

        <div className="min-w-0 flex-1 text-xs text-black/60">
          <div>Цель: ≤ {target} мин</div>
          <div className="mt-1">p50: {p50} мин · p90: {p90} мин</div>
          <div className="mt-1">Выборка: {sample}</div>
        </div>
      </div>
    </div>
  );
}

function SloBoard({ slo }: { slo: ReportResp["slo"] | null | undefined }) {
  const payment = slo?.paymentConfirm;
  const delivery = slo?.delivery;
  const cancelRate = Math.max(0, Math.min(100, slo?.cancelRatePct ?? 0));
  const stale = Math.max(0, slo?.staleAwaitingPayment ?? 0);

  return (
    <Card className="overflow-hidden border border-black/10 bg-white/88 p-0 shadow-[0_26px_60px_-36px_rgba(15,23,42,0.5)] backdrop-blur">
      <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold text-black/80">SLO мониторинг</div>
      <div className="grid gap-3 px-4 py-4 md:grid-cols-2 xl:grid-cols-3">
        <SloGauge
          title="Подтверждение оплаты"
          value={payment?.withinTargetPct ?? 0}
          target={payment?.targetMinutes ?? 0}
          p50={payment?.p50Minutes ?? 0}
          p90={payment?.p90Minutes ?? 0}
          sample={payment?.sampleSize ?? 0}
          color="#0ea5e9"
          tone="bg-sky-100 text-sky-700"
        />
        <SloGauge
          title="Доставка"
          value={delivery?.withinTargetPct ?? 0}
          target={delivery?.targetMinutes ?? 0}
          p50={delivery?.p50Minutes ?? 0}
          p90={delivery?.p90Minutes ?? 0}
          sample={delivery?.sampleSize ?? 0}
          color="#10b981"
          tone="bg-emerald-100 text-emerald-700"
        />

        <div className="rounded-2xl border border-black/10 bg-white/90 p-3">
          <div className="text-sm font-semibold text-black/80">Стабильность потока</div>
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm">
            <div className="font-semibold text-rose-700">Доля отмен</div>
            <div className="text-xs text-rose-700/80">{cancelRate}% от всех заказов периода</div>
          </div>
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm">
            <div className="font-semibold text-amber-700">Подвисшие оплаты</div>
            <div className="text-xs text-amber-700/80">{stale} заказ(ов) сейчас ждут оплату дольше лимита</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TopItemsChart({ items }: { items: Array<{ title: string; qty: number; revenueKgs: number }> }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  const maxQty = useMemo(() => Math.max(1, ...items.map((item) => item.qty)), [items]);
  const active = items[Math.min(activeIndex, Math.max(0, items.length - 1))] ?? null;

  return (
    <Card className="overflow-hidden border border-black/10 bg-white/88 p-0 shadow-[0_26px_60px_-36px_rgba(15,23,42,0.5)] backdrop-blur">
      <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold text-black/80">РўРѕРї Р±Р»СЋРґ</div>
      <div className="px-4 pb-4 pt-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4 text-sm text-black/55">РџРѕРєР° РЅРµС‚ РґРѕСЃС‚Р°РІР»РµРЅРЅС‹С… Р·Р°РєР°Р·РѕРІ.</div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const width = Math.max(8, Math.round((item.qty / maxQty) * 100));
              const isActive = idx === activeIndex;
              return (
                <button
                  key={item.title}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onFocus={() => setActiveIndex(idx)}
                  onClick={() => setActiveIndex(idx)}
                  className={`relative w-full overflow-hidden rounded-2xl border px-3 py-2 text-left text-sm transition ${
                    isActive ? "border-cyan-300 bg-cyan-50/70 shadow-[0_10px_24px_-18px_rgba(14,165,233,0.8)]" : "border-black/10 bg-white/80"
                  }`}
                >
                  <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-300/35 to-sky-300/20" style={{ width: `${width}%` }} />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/5 text-[11px] font-bold text-black/70">{idx + 1}</span>
                      <span className="truncate font-semibold">{item.title}</span>
                    </div>
                    <div className="shrink-0 text-xs font-semibold text-black/70">{item.qty} С€С‚.</div>
                  </div>
                </button>
              );
            })}

            {active ? (
              <div className="mt-2 rounded-2xl border border-black/10 bg-gradient-to-r from-white to-cyan-50/70 p-3 text-sm">
                <div className="font-semibold text-black/85">{active.title}</div>
                <div className="mt-1 text-xs text-black/60">РљРѕР»РёС‡РµСЃС‚РІРѕ: {active.qty} В· Р’С‹СЂСѓС‡РєР°: {formatKgs(active.revenueKgs)}</div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function AdminReportsPage() {
  const [days, setDays] = useState(14);
  const [report, setReport] = useState<ReportResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const [reportRes, auditRes] = await Promise.all([
          fetch(`/api/admin/reports/daily?days=${days}`, { cache: "no-store" }),
          fetch("/api/admin/audit?limit=40", { cache: "no-store" })
        ]);

        if (mounted && reportRes.ok) {
          const j = (await reportRes.json()) as ReportResp;
          setReport(j);
        }

        if (mounted && auditRes.ok) {
          const a = (await auditRes.json()) as { logs?: AuditRow[] };
          setAudit(a.logs ?? []);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [days]);

  const summary = report?.summary;
  const daily = report?.daily ?? [];
  const topItems = report?.topItems ?? [];
  const slo = report?.slo;

  const revenueValues = daily.map((row) => row.revenueKgs);
  const ordersValues = daily.map((row) => row.orders);
  const deliveredValues = daily.map((row) => row.delivered);
  const avgCheckValues = daily.map((row) => row.avgCheckKgs);

  return (
    <main className="min-h-screen p-3 sm:p-5">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[24px] border border-white/60 bg-gradient-to-br from-white/95 via-white/88 to-slate-100/70 p-3 shadow-[0_30px_80px_-52px_rgba(15,23,42,0.62)] backdrop-blur sm:rounded-[28px] sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-black/45">РђРґРјРёРЅРєР°</div>
              <div className="mt-1 text-3xl font-extrabold text-black/90">РћС‚С‡РµС‚С‹</div>
            </div>
            <div className="flex items-center gap-2">
              <Link className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/65" href="/admin">
                РќР°Р·Р°Рґ
              </Link>
              <AdminLogoutButton className="px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="mt-4 inline-flex flex-wrap gap-2 rounded-2xl border border-black/10 bg-white p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            {[7, 14, 30].map((value) => (
              <button
                key={value}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${days === value ? "bg-black text-white" : "text-black/70"}`}
                onClick={() => setDays(value)}
              >
                {value} РґРЅРµР№
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Р’С‹СЂСѓС‡РєР°"
              value={formatKgs(summary?.totalRevenueKgs ?? 0)}
              values={revenueValues}
              stroke="#0284c7"
              fill="#0891b2"
              accent="bg-cyan-300/30"
            />
            <KpiCard
              label="Р—Р°РєР°Р·С‹"
              value={summary?.totalOrders ?? 0}
              values={ordersValues}
              stroke="#0ea5e9"
              fill="#38bdf8"
              accent="bg-sky-300/30"
            />
            <KpiCard
              label="Р”РѕСЃС‚Р°РІР»РµРЅРѕ"
              value={summary?.totalDelivered ?? 0}
              values={deliveredValues}
              stroke="#10b981"
              fill="#34d399"
              accent="bg-emerald-300/30"
            />
            <KpiCard
              label="РЎСЂРµРґРЅРёР№ С‡РµРє"
              value={formatKgs(summary?.avgCheckKgs ?? 0)}
              values={avgCheckValues}
              stroke="#a855f7"
              fill="#c084fc"
              accent="bg-fuchsia-300/30"
            />
          </div>

          <div className="mt-4">
            <SloBoard slo={slo} />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <RevenueTrendChart rows={daily} />
            <ConversionDonut summary={summary} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <TopItemsChart items={topItems} />

            <Card className="overflow-hidden border border-black/10 bg-white/88 p-0 shadow-[0_26px_60px_-36px_rgba(15,23,42,0.5)] backdrop-blur">
              <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold text-black/80">Р–СѓСЂРЅР°Р» РґРµР№СЃС‚РІРёР№</div>
              <div className="max-h-[20rem] overflow-auto px-4 pb-4 pt-3 sm:max-h-[26rem]">
                <div className="space-y-2">
                  {audit.map((row) => (
                    <div key={row.id} className="rounded-xl border border-black/10 bg-white/88 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-black/85">{row.action}</div>
                        <div className="text-xs text-black/55">{new Date(row.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="mt-1 text-xs text-black/60">
                        {row.actor} В· {row.actorRole}
                        {row.orderId ? ` В· Р—Р°РєР°Р· #${row.orderId.slice(-6)}` : ""}
                      </div>
                    </div>
                  ))}

                  {!loading && audit.length === 0 ? <div className="rounded-xl border border-black/10 bg-white/80 p-3 text-sm text-black/55">Р–СѓСЂРЅР°Р» РїРѕРєР° РїСѓСЃС‚.</div> : null}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}







