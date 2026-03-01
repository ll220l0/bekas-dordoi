export type OrderStatusValue =
  | "created"
  | "pending_confirmation"
  | "confirmed"
  | "cooking"
  | "delivering"
  | "delivered"
  | "canceled";

type OrderStatusMeta = {
  label: string;
  badgeClassName: string;
};

const STATUS_META: Record<OrderStatusValue, OrderStatusMeta> = {
  created: {
    label: "Создан",
    badgeClassName: "bg-slate-100 text-slate-700 border-slate-200"
  },
  pending_confirmation: {
    label: "Ждет подтверждения",
    badgeClassName: "bg-amber-100 text-amber-700 border-amber-200"
  },
  confirmed: {
    label: "Подтвержден",
    badgeClassName: "bg-emerald-100 text-emerald-700 border-emerald-200"
  },
  cooking: {
    label: "Готовится",
    badgeClassName: "bg-indigo-100 text-indigo-700 border-indigo-200"
  },
  delivering: {
    label: "Передан курьеру",
    badgeClassName: "bg-sky-100 text-sky-700 border-sky-200"
  },
  delivered: {
    label: "Доставлен",
    badgeClassName: "bg-green-100 text-green-700 border-green-200"
  },
  canceled: {
    label: "Отменен",
    badgeClassName: "bg-rose-100 text-rose-700 border-rose-200"
  }
};

export function getOrderStatusMeta(status: string): OrderStatusMeta {
  if (status in STATUS_META) return STATUS_META[status as OrderStatusValue];
  return { label: status, badgeClassName: "bg-slate-100 text-slate-700 border-slate-200" };
}

export function isPendingConfirmation(status: string) {
  return status === "created" || status === "pending_confirmation";
}

export function isApprovedStatus(status: string) {
  return status === "confirmed" || status === "cooking" || status === "delivering" || status === "delivered";
}

export function isHistoryStatus(status: string) {
  return status === "delivered" || status === "canceled";
}

