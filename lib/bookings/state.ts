/**
 * Booking lifecycle. The database functions enforce the same transitions
 * with status guards; this module is what the UI and server actions use to
 * decide which actions to offer.
 *
 *   draft → pending_payment → confirmed → completed
 *                ↘ expired / failed      ↘ cancelled → (partially_)refunded
 *
 * An expired booking can still confirm if its payment arrives late and the
 * room is free; otherwise it fails and the payment is refunded.
 */

export const BOOKING_STATUSES = [
  "draft",
  "pending_payment",
  "confirmed",
  "completed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "failed",
  "expired",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  draft: ["pending_payment", "confirmed", "cancelled", "failed", "expired"],
  pending_payment: ["confirmed", "cancelled", "failed", "expired"],
  confirmed: ["completed", "cancelled", "partially_refunded", "refunded"],
  completed: ["partially_refunded", "refunded"],
  cancelled: ["partially_refunded", "refunded"],
  partially_refunded: ["partially_refunded", "refunded"],
  failed: ["partially_refunded", "refunded"],
  expired: ["confirmed", "failed"],
  refunded: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

/** Statuses that represent a stay the guest will (or did) take. */
export function isLive(status: BookingStatus): boolean {
  return status === "confirmed" || status === "completed";
}

export function isAwaitingPayment(status: BookingStatus): boolean {
  return status === "draft" || status === "pending_payment";
}

/** Visual tone for status badges. */
export function statusTone(status: BookingStatus): "success" | "warning" | "danger" | "muted" | "info" {
  switch (status) {
    case "confirmed":
      return "success";
    case "completed":
      return "info";
    case "draft":
    case "pending_payment":
      return "warning";
    case "failed":
    case "cancelled":
      return "danger";
    default:
      return "muted";
  }
}

/** Whether the customer may cancel online: a confirmed stay before its check-in. */
export function customerCanCancel(status: BookingStatus, checkInAt: Date, now: Date): boolean {
  return status === "confirmed" && now.getTime() < checkInAt.getTime();
}

// Crockford base32 without I, L, O, U: easy to read out on the phone.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A booking reference like `PS7K3Q9XD2`. `random(n)` returns an integer in [0, n). */
export function generateBookingCode(random: (n: number) => number, length = 8): string {
  let out = "PS";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  return out;
}

/** Amount still due on a booking (for pay-at-hotel and part payments). */
export function balanceDue(b: { totalPaise: number; paidPaise: number }): number {
  return Math.max(0, b.totalPaise - b.paidPaise);
}
