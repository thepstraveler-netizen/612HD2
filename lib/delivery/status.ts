import type { DeliverySettings, OrderStatus } from "@/schemas/delivery";

/** Order progress shared by the tracking page, the vendor dashboard and the admin board. Mirrors set_order_status. */

/** The customer's tracker: Placed → Accepted → Preparing → Out for delivery → Delivered. */
export const TRACK_STEPS = ["placed", "accepted", "preparing", "out_for_delivery", "delivered"] as const;
export type TrackStep = (typeof TRACK_STEPS)[number];

/** Index of the last reached tracker step, or -1 before payment / when cancelled or rejected. */
export function trackIndex(status: OrderStatus): number {
  if (status === "ready") return TRACK_STEPS.indexOf("preparing");
  return (TRACK_STEPS as readonly string[]).indexOf(status);
}

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: [],
  placed: ["accepted", "rejected"],
  accepted: ["preparing", "ready", "out_for_delivery"],
  preparing: ["ready", "out_for_delivery"],
  ready: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
  rejected: [],
};

export function nextStatuses(status: OrderStatus): OrderStatus[] {
  return NEXT[status];
}

/** The main button on a store's order card (secondary moves stay in the menu). */
export function primaryNext(status: OrderStatus): OrderStatus | null {
  const map: Partial<Record<OrderStatus, OrderStatus>> = {
    placed: "accepted",
    accepted: "preparing",
    preparing: "ready",
    ready: "out_for_delivery",
    out_for_delivery: "delivered",
  };
  return map[status] ?? null;
}

/** Board columns, in order. */
export const BOARD_COLUMNS = ["placed", "accepted", "preparing", "ready", "out_for_delivery"] as const;

export const ACTIVE_STATUSES: readonly OrderStatus[] = BOARD_COLUMNS;

export function isActive(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** Customers cancel themselves only before the store accepts (setting), or while unpaid. */
export function customerCanCancel(status: OrderStatus, settings: Pick<DeliverySettings, "cancel_until">): boolean {
  if (status === "awaiting_payment") return true;
  return settings.cancel_until === "placed" && status === "placed";
}

export function canRate(status: OrderStatus, ratedAt: string | null): boolean {
  return status === "delivered" && ratedAt === null;
}
