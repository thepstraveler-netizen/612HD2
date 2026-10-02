import type { DraftLine } from "@/lib/pricing/booking";
import type { CartLine, DeliverySettings, Diet, OrderPaymentMode, QuoteLine } from "@/schemas/delivery";
import type { DeliveryZone, MenuItem, Store, StoreMenu } from "./types";

/**
 * Cart pricing for food, essentials and medicine orders. Pure, over the
 * store's menu and settings, so the cart drawer, the checkout page and the
 * order action agree to the paisa; the server always re-runs it from the
 * database and never trusts prices from the browser.
 *
 * Lines (all amounts before GST):
 *   * item       qty × (item or variant price + add-ons). Coupons apply here only.
 *                GST at the item's rate, else the store's (restaurants 5%).
 *   * fee        packaging (restaurants), taxed like the food; never discounted.
 *   * delivery   the zone's fee, free when items after discount reach the
 *                zone's threshold; GST at the delivery rate.
 *   * fee        convenience fee on online payments only.
 */

export type ResolvedAddon = { id: string; name: string; price_paise: number };

export type ResolvedLine = {
  itemId: string;
  variantId: string | null;
  addonIds: string[];
  qty: number;
  /** English names for the order, invoice and kitchen ticket. */
  name: string;
  variantName: string | null;
  addons: ResolvedAddon[];
  diet: Diet;
  unitPricePaise: number;
  lineTotalPaise: number;
  taxBps: number;
  hsn: string | null;
};

export type CartLineError = "item_unavailable" | "variant_required" | "addon_invalid" | "out_of_stock";

export type ResolveResult =
  | { ok: true; lines: ResolvedLine[] }
  | { ok: false; error: CartLineError | "too_many_lines" | "empty"; itemId?: string };

/** Same item, variant and add-ons → one line (quantities add up). */
export function lineKey(l: Pick<CartLine, "itemId" | "variantId" | "addonIds">): string {
  return [l.itemId, l.variantId ?? "", [...l.addonIds].sort().join(",")].join("|");
}

export function mergeLines(lines: readonly CartLine[]): CartLine[] {
  const merged = new Map<string, CartLine>();
  for (const l of lines) {
    const key = lineKey(l);
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, qty: Math.min(99, prev.qty + l.qty) } : { ...l, addonIds: [...l.addonIds] });
  }
  return [...merged.values()];
}

function resolveLine(line: CartLine, item: MenuItem | undefined, store: Store): ResolvedLine | CartLineError {
  if (!item || !item.isAvailable) return "item_unavailable";

  let unit = item.pricePaise;
  let variantName: string | null = null;
  if (item.variants.length > 0) {
    const variant = item.variants.find((v) => v.id === line.variantId);
    if (!variant) return "variant_required";
    if (!variant.isAvailable) return "item_unavailable";
    if (variant.stock !== null && variant.stock < line.qty) return "out_of_stock";
    unit = variant.pricePaise;
    variantName = variant.name.en;
  } else if (line.variantId) {
    return "variant_required";
  }
  if (item.trackStock && (item.stock ?? 0) < line.qty) return "out_of_stock";

  const chosen = new Set(line.addonIds);
  if (chosen.size !== line.addonIds.length) return "addon_invalid";
  const addons: ResolvedAddon[] = [];
  for (const group of item.addonGroups) {
    const picked = group.addons.filter((a) => chosen.has(a.id));
    if (picked.length < group.min || picked.length > group.max) return "addon_invalid";
    for (const a of picked) {
      if (!a.isAvailable) return "addon_invalid";
      addons.push({ id: a.id, name: a.name.en, price_paise: a.pricePaise });
      chosen.delete(a.id);
    }
  }
  if (chosen.size > 0) return "addon_invalid";

  unit += addons.reduce((s, a) => s + a.price_paise, 0);
  return {
    itemId: item.id,
    variantId: variantName ? line.variantId : null,
    addonIds: addons.map((a) => a.id),
    qty: line.qty,
    name: item.name.en,
    variantName,
    addons,
    diet: item.diet,
    unitPricePaise: unit,
    lineTotalPaise: unit * line.qty,
    taxBps: item.taxBps ?? store.taxBps,
    hsn: item.hsn,
  };
}

/** Checks every line against the live menu: availability, variant, add-on rules and stock. */
export function resolveCart(lines: readonly CartLine[], menu: StoreMenu, maxLines: number): ResolveResult {
  const merged = mergeLines(lines);
  if (merged.length === 0) return { ok: false, error: "empty" };
  if (merged.length > maxLines) return { ok: false, error: "too_many_lines" };
  const byId = new Map(menu.items.map((i) => [i.id, i]));

  // Stock is per item across lines (two variants of a tracked item share it).
  const qtyByItem = new Map<string, number>();
  for (const l of merged) qtyByItem.set(l.itemId, (qtyByItem.get(l.itemId) ?? 0) + l.qty);

  const out: ResolvedLine[] = [];
  for (const line of merged) {
    const item = byId.get(line.itemId);
    if (item?.trackStock && (item.stock ?? 0) < (qtyByItem.get(item.id) ?? 0)) {
      return { ok: false, error: "out_of_stock", itemId: line.itemId };
    }
    const r = resolveLine(line, item, menu.store);
    if (typeof r === "string") return { ok: false, error: r, itemId: line.itemId };
    out.push(r);
  }
  return { ok: true, lines: out };
}

export function itemsSubtotal(lines: readonly Pick<ResolvedLine, "lineTotalPaise">[]): number {
  return lines.reduce((s, l) => s + l.lineTotalPaise, 0);
}

/** English line text for the invoice: "2 × Braj Thali (Deluxe) + Extra roti". */
export function describeLine(l: Pick<ResolvedLine, "qty" | "name" | "variantName" | "addons">): string {
  const variant = l.variantName ? ` (${l.variantName})` : "";
  const addons = l.addons.length ? ` + ${l.addons.map((a) => a.name).join(", ")}` : "";
  return `${l.qty} × ${l.name}${variant}${addons}`;
}

export type FeeTerms = { convenienceFeePaise: number; feeTaxBps: number; feeSac: string };

export type DeliveryCharge = {
  /** Before GST; 0 when free. */
  feePaise: number;
  free: boolean;
  /** How much more (items after discount) unlocks free delivery; null if the zone never delivers free. */
  toFreePaise: number | null;
};

export function deliveryCharge(zone: DeliveryZone, itemsAfterDiscountPaise: number): DeliveryCharge {
  if (zone.freeAbovePaise !== null && itemsAfterDiscountPaise >= zone.freeAbovePaise) {
    return { feePaise: 0, free: zone.feePaise > 0, toFreePaise: 0 };
  }
  return {
    feePaise: zone.feePaise,
    free: false,
    toFreePaise: zone.freeAbovePaise === null ? null : zone.freeAbovePaise - itemsAfterDiscountPaise,
  };
}

const draft = (d: Omit<DraftLine, "date" | "roomId" | "ratePlanId">): DraftLine => ({
  ...d,
  date: null,
  roomId: null,
  ratePlanId: null,
});

export type CartPricingInput = {
  store: Store;
  zone: DeliveryZone;
  lines: readonly ResolvedLine[];
  /** Coupon discount on items (already capped by the coupon engine). */
  discountPaise: number;
  settings: DeliverySettings;
  /** Online payments only; null for cash on delivery. */
  fee: FeeTerms | null;
};

export type CartPricing = { drafts: DraftLine[]; itemsPaise: number; delivery: DeliveryCharge };

export function buildCartLines(input: CartPricingInput): CartPricing {
  const { store, settings } = input;
  const food = store.kind === "restaurant";
  const drafts: DraftLine[] = input.lines.map((l, i) =>
    draft({
      key: `item:${i}`,
      kind: "item",
      description: describeLine(l),
      quantity: l.qty,
      amountPaise: l.lineTotalPaise,
      discountable: true,
      tax: { mode: "fixed", rateBps: l.taxBps },
      sac: food ? settings.food_sac : (l.hsn ?? settings.goods_sac),
    }),
  );
  const itemsPaise = itemsSubtotal(input.lines);

  if (store.packagingFeePaise > 0) {
    drafts.push(
      draft({
        key: "fee:packaging",
        kind: "fee",
        description: "Packaging",
        quantity: 1,
        amountPaise: store.packagingFeePaise,
        discountable: false,
        tax: { mode: "fixed", rateBps: store.taxBps },
        sac: food ? settings.food_sac : settings.goods_sac,
      }),
    );
  }

  const discount = Math.max(0, Math.min(input.discountPaise, itemsPaise));
  const delivery = deliveryCharge(input.zone, itemsPaise - discount);
  if (delivery.feePaise > 0) {
    drafts.push(
      draft({
        key: "delivery",
        kind: "delivery",
        description: `Delivery · ${input.zone.name.en}`,
        quantity: 1,
        amountPaise: delivery.feePaise,
        discountable: false,
        tax: { mode: "fixed", rateBps: settings.delivery_tax_bps },
        sac: settings.delivery_sac,
      }),
    );
  }

  if (input.fee && input.fee.convenienceFeePaise > 0) {
    drafts.push(
      draft({
        key: "fee:convenience",
        kind: "fee",
        description: "Convenience fee",
        quantity: 1,
        amountPaise: input.fee.convenienceFeePaise,
        discountable: false,
        tax: { mode: "fixed", rateBps: input.fee.feeTaxBps },
        sac: input.fee.feeSac,
      }),
    );
  }
  return { drafts, itemsPaise, delivery };
}

/** Which payment options this order total allows. Online needs Razorpay; COD has a ceiling. */
export function orderPayModes(
  totalPaise: number,
  settings: Pick<DeliverySettings, "cod_enabled" | "max_cod_paise">,
  online: boolean,
): OrderPaymentMode[] {
  const modes: OrderPaymentMode[] = [];
  if (online) modes.push("online");
  if (settings.cod_enabled && totalPaise <= settings.max_cod_paise) modes.push("cod");
  return modes;
}

/** A pharmacy's quote as price lines (medicines at their own GST, then delivery and any online fee). */
export function buildQuoteLines(
  lines: readonly QuoteLine[],
  deliveryFeePaise: number,
  settings: DeliverySettings,
  fee: FeeTerms | null,
): DraftLine[] {
  const drafts = lines.map((l, i) =>
    draft({
      key: `item:${i}`,
      kind: "item",
      description: `${l.qty} × ${l.name}${l.pack ? ` (${l.pack})` : ""}`,
      quantity: l.qty,
      amountPaise: l.qty * l.unit_price_paise,
      discountable: false,
      tax: { mode: "fixed", rateBps: l.tax_bps },
      sac: l.hsn || settings.goods_sac,
    }),
  );
  if (deliveryFeePaise > 0) {
    drafts.push(
      draft({
        key: "delivery",
        kind: "delivery",
        description: "Delivery",
        quantity: 1,
        amountPaise: deliveryFeePaise,
        discountable: false,
        tax: { mode: "fixed", rateBps: settings.delivery_tax_bps },
        sac: settings.delivery_sac,
      }),
    );
  }
  if (fee && fee.convenienceFeePaise > 0) {
    drafts.push(
      draft({
        key: "fee:convenience",
        kind: "fee",
        description: "Convenience fee",
        quantity: 1,
        amountPaise: fee.convenienceFeePaise,
        discountable: false,
        tax: { mode: "fixed", rateBps: fee.feeTaxBps },
        sac: fee.feeSac,
      }),
    );
  }
  return drafts;
}
