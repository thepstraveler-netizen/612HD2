import { z } from "zod";
import type { OrderStatus } from "@/schemas/delivery";
import type { RiderMove, VendorMove } from "@/schemas/delivery-vendor";
import { BOARD_COLUMNS, nextStatuses, primaryNext } from "./status";

/**
 * Pure helpers for the vendor dashboard and the rider link: which buttons
 * an order card shows, grouping, the day's summary and cash to collect.
 * Unit-tested in tests/unit/delivery-vendor.test.ts.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Midnight India time of the day `now` falls in. */
export function indiaDayStart(now: Date): Date {
  const local = now.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

export function minutesSince(at: string | null, now: number): number {
  if (!at) return 0;
  return Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));
}

export type VendorOrderAction = {
  status: VendorMove;
  primary: boolean;
  needsOtp: boolean;
  needsReason: boolean;
};

/** Moves only a store delivering the order itself makes (otherwise the rider does, from the link). */
const SELF_DELIVERY_MOVES: readonly OrderStatus[] = ["out_for_delivery", "delivered"];

/**
 * The buttons on a store's order card. "Out for delivery" and "Delivered"
 * show only when the store delivers itself (no rider, or one of its own).
 */
export function vendorActions(
  status: OrderStatus,
  opts: { selfDelivery: boolean; requireOtp: boolean },
): VendorOrderAction[] {
  const moves = nextStatuses(status).filter(
    (s): s is VendorMove => opts.selfDelivery || !SELF_DELIVERY_MOVES.includes(s),
  );
  const main = primaryNext(status);
  const primary = moves.includes(main as VendorMove) ? main : (moves.find((s) => s !== "rejected") ?? null);
  return moves.map((s) => ({
    status: s,
    primary: s === primary,
    needsOtp: s === "delivered" && opts.requireOtp,
    needsReason: s === "rejected",
  }));
}

/** The store delivers itself when no rider is assigned or the rider is one of its own. */
export function deliversItself(partnerId: string | null, ownRiderIds: ReadonlySet<string>): boolean {
  return partnerId === null || ownRiderIds.has(partnerId);
}

/** Steps a rider can take from the link, by order status (set_order_status allows partners only these). */
export const RIDER_NEXT: Partial<Record<OrderStatus, RiderMove[]>> = {
  accepted: ["out_for_delivery"],
  preparing: ["out_for_delivery"],
  ready: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
};

export type RiderAction = { status: RiderMove; needsOtp: boolean };

export function riderActions(status: OrderStatus, requireOtp: boolean): RiderAction[] {
  return (RIDER_NEXT[status] ?? []).map((s) => ({ status: s, needsOtp: s === "delivered" && requireOtp }));
}

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** Live orders by board column, oldest first within each (the kitchen works in order). */
export function groupByStatus<T extends { status: OrderStatus; placedAt: string | null }>(
  orders: readonly T[],
): Record<BoardColumn, T[]> {
  const out = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, [] as T[]])) as Record<BoardColumn, T[]>;
  for (const o of orders) {
    if ((BOARD_COLUMNS as readonly string[]).includes(o.status)) out[o.status as BoardColumn].push(o);
  }
  for (const c of BOARD_COLUMNS) {
    out[c].sort((a, b) => Date.parse(a.placedAt ?? "") - Date.parse(b.placedAt ?? ""));
  }
  return out;
}

export type DaySummary = {
  /** Orders placed today (India time). */
  todayCount: number;
  /** Total of orders delivered today. */
  deliveredPaise: number;
  deliveredCount: number;
  /** Waiting for the store to accept. */
  pending: number;
  /** Accepted and not yet delivered. */
  inProgress: number;
};

export function daySummary(
  orders: readonly {
    status: OrderStatus;
    placedAt: string | null;
    deliveredAt: string | null;
    totalPaise: number;
  }[],
  now: Date,
): DaySummary {
  const start = indiaDayStart(now).getTime();
  const today = (at: string | null) => at !== null && Date.parse(at) >= start;
  const delivered = orders.filter((o) => o.status === "delivered" && today(o.deliveredAt));
  return {
    todayCount: orders.filter((o) => o.status !== "awaiting_payment" && today(o.placedAt)).length,
    deliveredPaise: delivered.reduce((sum, o) => sum + o.totalPaise, 0),
    deliveredCount: delivered.length,
    pending: orders.filter((o) => o.status === "placed").length,
    inProgress: orders.filter((o) =>
      ["accepted", "preparing", "ready", "out_for_delivery"].includes(o.status),
    ).length,
  };
}

/** Cash the rider (or store) collects at the door, and what was paid online. */
export function orderCash(b: { totalPaise: number; paidPaise: number; refundedPaise: number }): {
  collectPaise: number;
  paidOnlinePaise: number;
} {
  return {
    collectPaise: Math.max(0, b.totalPaise - b.paidPaise),
    paidOnlinePaise: Math.max(0, b.paidPaise - b.refundedPaise),
  };
}

/** Average of 1–5 star ratings to one decimal, or null with none. */
export function averageRating(ratings: readonly (number | null)[]): number | null {
  const valid = ratings.filter((r): r is number => typeof r === "number" && r >= 1 && r <= 5);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((s, r) => s + r, 0) / valid.length) * 10) / 10;
}

const addressSchema = z.object({
  contact_name: z.string().nullish(),
  phone: z.string().nullish(),
  line1: z.string().nullish(),
  line2: z.string().nullish(),
  landmark: z.string().nullish(),
  pincode: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
});

export type OrderAddress = {
  name: string;
  phone: string;
  /** One line: house/street, area, landmark, PIN. */
  text: string;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
};

/** The order's delivery address (orders.address), read leniently. */
export function orderAddress(value: unknown): OrderAddress {
  const parsed = addressSchema.safeParse(value);
  const a = parsed.success ? parsed.data : {};
  return {
    name: a.contact_name ?? "",
    phone: a.phone ?? "",
    text: [a.line1, a.line2, a.pincode].filter((p): p is string => Boolean(p && p.trim())).join(", "),
    landmark: a.landmark?.trim() || null,
    lat: a.lat ?? null,
    lng: a.lng ?? null,
  };
}

const addonsSchema = z.array(z.object({ name: z.string() }).loose());

/** Add-on names of an order line (order_items.addons). */
export function addonNames(value: unknown): string[] {
  const parsed = addonsSchema.safeParse(value);
  return parsed.success ? parsed.data.map((a) => a.name) : [];
}

/** Errors the dashboard and rider link show, by the code the database raised. */
export const ACTION_ERRORS = [
  "forbidden",
  "invalid",
  "not_found",
  "otp_mismatch",
  "invalid_transition",
  "partner_unavailable",
  "price_above_mrp",
  "no_link",
  "unavailable",
  "unknown",
] as const;
export type ActionError = (typeof ACTION_ERRORS)[number];

export function actionError(code: string): ActionError {
  return (ACTION_ERRORS as readonly string[]).includes(code) ? (code as ActionError) : "unknown";
}

/** Opening hours grouped by weekday (Mon = 1 … Sun = 7), as "HH:MM–HH:MM" ranges; days without slots are closed. */
export function hoursByDay(hours: readonly { day: number; open: string; close: string }[]): {
  day: number;
  slots: string[];
}[] {
  return [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    day,
    slots: hours
      .filter((h) => h.day === day && h.open !== h.close)
      .sort((a, b) => a.open.localeCompare(b.open))
      .map((h) => `${h.open}–${h.close}`),
  }));
}
