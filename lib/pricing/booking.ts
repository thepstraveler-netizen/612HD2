import type { MealPlan, StayQuote } from "@/lib/availability/engine";
import type { IsoDate } from "@/lib/dates";
import { gstRateBps, type GstSlab } from "./tax";

/**
 * Turns a stay quote plus the guest's checkout choices into invoice-ready
 * lines with discount and GST. Pure: the review page preview and the
 * server-side booking call run the same code, and the booking stores these
 * lines, so the invoice always matches what was charged.
 *
 * GST rules applied (rates come from settings, not code):
 *   * Accommodation is taxed per room per night, at the slab for what that
 *     room-night actually costs after discount.
 *   * Add-ons (early check-in, late checkout, breakfast) are part of the
 *     stay, so they take the stay's highest room-night rate.
 *   * The convenience fee is a separate service at its own rate and is never
 *     discounted.
 */

export type LineKind =
  | "room"
  | "extra_guest"
  | "addon"
  | "fee"
  | "fare"
  | "allowance"
  | "surcharge"
  | "item"
  | "delivery"
  | "package"
  | "service";
export type AddonKey = "early_checkin" | "late_checkout" | "breakfast";
export const ADDON_KEYS: readonly AddonKey[] = ["early_checkin", "late_checkout", "breakfast"];

type TaxMode = { mode: "room_slab" } | { mode: "principal" } | { mode: "fixed"; rateBps: number };

export type DraftLine = {
  key: string;
  kind: LineKind;
  /** English text for the invoice; the UI labels lines by kind/key instead. */
  description: string;
  date: IsoDate | null;
  roomId: string | null;
  ratePlanId: string | null;
  quantity: number;
  amountPaise: number;
  discountable: boolean;
  tax: TaxMode;
  sac: string;
};

export type PriceLine = Omit<DraftLine, "discountable" | "tax"> & {
  discountPaise: number;
  taxRateBps: number;
  taxPaise: number;
};

export type BookingPrice = {
  lines: PriceLine[];
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
};

export type AddonPrices = Record<AddonKey, number | null>;
export type AddonChoice = Partial<Record<AddonKey, boolean>>;

export type HotelLinesInput = {
  quote: StayQuote;
  roomName: string;
  planName: string;
  mealPlan: MealPlan;
  rooms: number;
  guests: number;
  addons: AddonChoice;
  addonPrices: AddonPrices;
  /** Charged only on online payments; 0 disables it. */
  convenienceFeePaise: number;
  feeTaxBps: number;
  sac: { accommodation: string; services: string };
};

/** Add-ons this hotel offers for this plan (breakfast only when the plan has none). */
export function availableAddons(prices: AddonPrices, mealPlan: MealPlan): AddonKey[] {
  return ADDON_KEYS.filter((k) => prices[k] !== null && (k !== "breakfast" || mealPlan === "room_only"));
}

export function buildHotelLines(input: HotelLinesInput): DraftLine[] {
  const { quote, rooms, guests, addonPrices, sac } = input;
  const lines: DraftLine[] = quote.roomNights.map((n) => ({
    key: `room:${n.date}:${n.room}`,
    kind: "room",
    description: `${input.roomName} (${input.planName}) · ${n.date} · room ${n.room}`,
    date: n.date,
    roomId: quote.roomId,
    ratePlanId: quote.ratePlanId,
    quantity: 1,
    amountPaise: n.ratePaise + n.extraPaise,
    discountable: true,
    tax: { mode: "room_slab" },
    sac: sac.accommodation,
  }));

  const offered = new Set(availableAddons(addonPrices, input.mealPlan));
  const nights = quote.nights.length;
  const addon = (key: AddonKey, description: string, quantity: number) => {
    const unit = addonPrices[key];
    if (!input.addons[key] || !offered.has(key) || unit === null || quantity < 1) return;
    lines.push({
      key: `addon:${key}`,
      kind: "addon",
      description,
      date: null,
      roomId: null,
      ratePlanId: null,
      quantity,
      amountPaise: unit * quantity,
      discountable: true,
      tax: { mode: "principal" },
      sac: sac.accommodation,
    });
  };
  addon("early_checkin", "Early check-in", rooms);
  addon("late_checkout", "Late checkout", rooms);
  addon("breakfast", "Breakfast", guests * nights);

  if (input.convenienceFeePaise > 0) {
    lines.push({
      key: "fee:convenience",
      kind: "fee",
      description: "Convenience fee",
      date: null,
      roomId: null,
      ratePlanId: null,
      quantity: 1,
      amountPaise: input.convenienceFeePaise,
      discountable: false,
      tax: { mode: "fixed", rateBps: input.feeTaxBps },
      sac: sac.services,
    });
  }
  return lines;
}

/** The amount a coupon applies to: everything except fees, before tax. */
export function discountableBase(lines: readonly DraftLine[]): number {
  return lines.reduce((sum, l) => sum + (l.discountable ? l.amountPaise : 0), 0);
}

/**
 * Splits `total` across `weights` in proportion, in whole paise, so the
 * parts always add up exactly (largest remainder; ties go to earlier lines).
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

export function finalizePrice(
  drafts: readonly DraftLine[],
  discountPaise: number,
  gstSlabs: readonly GstSlab[],
): BookingPrice {
  const base = discountableBase(drafts);
  const discount = Math.max(0, Math.min(Math.round(discountPaise), base));
  const shares = allocate(
    discount,
    drafts.map((l) => (l.discountable ? l.amountPaise : 0)),
  );

  const roomRates = drafts.map((l, i) =>
    l.tax.mode === "room_slab" ? gstRateBps(gstSlabs, l.amountPaise - shares[i]) : 0,
  );
  const principalRate = Math.max(0, ...roomRates);

  const lines: PriceLine[] = drafts.map((l, i) => {
    const rate =
      l.tax.mode === "room_slab" ? roomRates[i] : l.tax.mode === "principal" ? principalRate : l.tax.rateBps;
    const taxable = l.amountPaise - shares[i];
    return {
      key: l.key,
      kind: l.kind,
      description: l.description,
      date: l.date,
      roomId: l.roomId,
      ratePlanId: l.ratePlanId,
      quantity: l.quantity,
      amountPaise: l.amountPaise,
      sac: l.sac,
      discountPaise: shares[i],
      taxRateBps: rate,
      taxPaise: Math.round((taxable * rate) / 10_000),
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.amountPaise, 0);
  const tax = lines.reduce((s, l) => s + l.taxPaise, 0);
  return {
    lines,
    subtotalPaise: subtotal,
    discountPaise: discount,
    taxPaise: tax,
    totalPaise: subtotal - discount + tax,
  };
}

export type PaymentMode = "full" | "part" | "pay_at_hotel";

/** What the guest pays online now. Part payments round up to whole rupees. */
export function payableNow(totalPaise: number, mode: PaymentMode, advancePercent: number): number {
  if (mode === "pay_at_hotel") return 0;
  if (mode === "full") return totalPaise;
  const advance = Math.ceil((totalPaise * advancePercent) / 100 / 100) * 100;
  return Math.min(totalPaise, Math.max(100, advance));
}

/** Tax split for an intra-state supply (accommodation is taxed where the property is). */
export function splitGst(taxPaise: number): { cgstPaise: number; sgstPaise: number } {
  const cgst = Math.floor(taxPaise / 2);
  return { cgstPaise: cgst, sgstPaise: taxPaise - cgst };
}
