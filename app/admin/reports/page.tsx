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

  const conversion = useMemo(() => {
    if (!summary || summary.totalOrders === 0) return 0;
    return Math.round((summary.totalDelivered / summary.totalOrders) * 100);
  }, [summary]);

  return (
    <main className="min-h-screen p-5">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-black/50">Админка</div>
            <div className="text-3xl font-extrabold">Отчеты</div>
          </div>
          <div className="flex items-center gap-2">
            <Link className="text-sm text-black/60 underline" href="/admin">
              Назад
            </Link>
            <AdminLogoutButton className="px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-4 inline-flex gap-2 rounded-2xl border border-black/10 bg-white p-1">
          {[7, 14, 30].map((value) => (
            <button
              key={value}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${days === value ? "bg-black text-white" : "text-black/70"}`}
              onClick={() => setDays(value)}
            >
              {value} дней
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Card className="p-4">
            <div className="text-xs text-black/55">Выручка</div>
            <div className="mt-1 text-2xl font-extrabold">{formatKgs(summary?.totalRevenueKgs ?? 0)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-black/55">Заказы</div>
            <div className="mt-1 text-2xl font-extrabold">{summary?.totalOrders ?? 0}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-black/55">Средний чек</div>
            <div className="mt-1 text-2xl font-extrabold">{formatKgs(summary?.avgCheckKgs ?? 0)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-black/55">Доставлено / Конверсия</div>
            <div className="mt-1 text-2xl font-extrabold">{summary?.totalDelivered ?? 0} / {conversion}%</div>
          </Card>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold">Дневная статистика</div>
            <div className="max-h-96 overflow-auto px-4 py-3">
              <div className="space-y-2">
                {daily.map((row) => (
                  <div key={row.date} className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{row.date}</div>
                      <div className="font-bold">{formatKgs(row.revenueKgs)}</div>
                    </div>
                    <div className="mt-1 text-xs text-black/60">Заказы: {row.orders} · Доставлено: {row.delivered} · Отменено: {row.canceled}</div>
                  </div>
                ))}
                {!loading && daily.length === 0 && <div className="text-sm text-black/50">Нет данных за выбранный период.</div>}
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold">Топ блюд</div>
            <div className="max-h-96 overflow-auto px-4 py-3">
              <div className="space-y-2">
                {topItems.map((row) => (
                  <div key={row.title} className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm">
                    <div className="font-semibold">{row.title}</div>
                    <div className="mt-1 text-xs text-black/60">Кол-во: {row.qty} · Выручка: {formatKgs(row.revenueKgs)}</div>
                  </div>
                ))}
                {!loading && topItems.length === 0 && <div className="text-sm text-black/50">Пока нет доставленных заказов.</div>}
              </div>
            </div>
          </Card>
        </div>

        <Card className="mt-5 overflow-hidden p-0">
          <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold">Журнал действий админа</div>
          <div className="max-h-80 overflow-auto px-4 py-3">
            <div className="space-y-2">
              {audit.map((row) => (
                <div key={row.id} className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{row.action}</div>
                    <div className="text-xs text-black/55">{new Date(row.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="mt-1 text-xs text-black/60">
                    {row.actor} · {row.actorRole}
                    {row.orderId ? ` · Заказ #${row.orderId.slice(-6)}` : ""}
                  </div>
                </div>
              ))}
              {!loading && audit.length === 0 && <div className="text-sm text-black/50">Журнал пока пуст.</div>}
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
