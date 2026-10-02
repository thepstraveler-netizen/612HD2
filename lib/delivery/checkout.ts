import "server-only";
import { getFeatureFlag, getInvoiceSettings, getPaymentSettings } from "@/lib/bookings/settings";
import { checkCoupon } from "@/lib/coupons/check";
import { normalizeCouponCode, type CouponRejection } from "@/lib/coupons/engine";
import { hasServiceRole, razorpayConfig } from "@/lib/env.server";
import { finalizePrice, type BookingPrice, type PriceLine } from "@/lib/pricing/booking";
import type { CartQuote, DeliverySettings, OrderPaymentMode, StoreKind } from "@/schemas/delivery";
import {
  buildCartLines,
  itemsSubtotal,
  orderPayModes,
  resolveCart,
  type CartLineError,
  type DeliveryCharge,
  type ResolvedLine,
} from "./cart";
import { canOrderNow } from "./hours";
import { getDeliverySettings, getDeliveryZones, getLiveStoreMenu } from "./queries";
import type { DeliveryZone, Store } from "./types";

/**
 * Prices a cart on the server from the live menu, zone, settings and coupon
 * table. The cart drawer and checkout page show this; the order action
 * calls it again and stores exactly what it returns.
 */

export const SHOP_FLAG: Record<StoreKind, string> = {
  restaurant: "booking.food",
  grocery: "booking.essentials",
  pharmacy: "booking.medicine",
};

export type OrderCheckoutError =
  | CartLineError
  | "booking_closed"
  | "not_found"
  | "store_closed"
  | "zone_not_served"
  | "too_many_lines"
  | "empty"
  | "no_payment_mode";

export type OrderCheckoutQuote = {
  ok: true;
  store: Store;
  zone: DeliveryZone | null;
  zones: DeliveryZone[];
  lines: ResolvedLine[];
  price: BookingPrice;
  delivery: DeliveryCharge | null;
  /** Items total is below the store's minimum (checkout blocked until it is met). */
  shortOfMinimumPaise: number;
  pay: OrderPaymentMode;
  payModes: OrderPaymentMode[];
  payableNowPaise: number;
  coupon: { id: string; code: string; discountPaise: number } | null;
  couponError: CouponRejection | null;
  settings: DeliverySettings;
  etaMinutes: number | null;
};

export type OrderCheckoutResult = OrderCheckoutQuote | { ok: false; error: OrderCheckoutError; itemId?: string };

export async function prepareOrderCheckout(input: CartQuote, userId: string | null): Promise<OrderCheckoutResult> {
  if (!hasServiceRole()) return { ok: false, error: "booking_closed" };
  const [menu, zones, settings, payments, invoice] = await Promise.all([
    getLiveStoreMenu(input.storeId),
    getDeliveryZones(),
    getDeliverySettings(),
    getPaymentSettings(),
    getInvoiceSettings(),
  ]);
  if (!menu) return { ok: false, error: "not_found" };
  const { store } = menu;
  // Medicines are only sold through a reviewed prescription and quote.
  if (store.kind === "pharmacy") return { ok: false, error: "not_found" };
  if (!(await getFeatureFlag(SHOP_FLAG[store.kind]))) return { ok: false, error: "booking_closed" };
  if (!canOrderNow(store, new Date())) return { ok: false, error: "store_closed" };

  const servedZones = zones.filter((z) => store.zoneIds.includes(z.id));
  const zone = input.zoneId ? (servedZones.find((z) => z.id === input.zoneId) ?? null) : null;
  if (input.zoneId && !zone) return { ok: false, error: "zone_not_served" };

  const resolved = resolveCart(input.lines, menu, settings.max_items);
  if (!resolved.ok) return resolved;

  const online = Boolean(razorpayConfig());
  const code = input.coupon ? normalizeCouponCode(input.coupon) : "";
  const service = store.kind === "restaurant" ? "food" : "essentials";
  const { coupon, error: couponError } = code
    ? await checkCoupon(code, {
        service,
        hotelId: null,
        basePaise: itemsSubtotal(resolved.lines),
        userId,
      })
    : { coupon: null, error: null };
  const discount = coupon?.discountPaise ?? 0;

  // Price without the online fee first to learn which payment modes the total allows.
  const priceFor = (pay: OrderPaymentMode) => {
    const built = buildCartLines({
      store,
      zone: zone ?? { id: "", slug: "", name: { en: "" }, feePaise: 0, freeAbovePaise: null, etaMinutes: 0 },
      lines: resolved.lines,
      discountPaise: discount,
      settings,
      fee:
        pay === "online"
          ? {
              convenienceFeePaise: payments.convenience_fee_paise,
              feeTaxBps: payments.fee_tax_bps,
              feeSac: invoice.sac_services,
            }
          : null,
    });
    return { ...built, price: finalizePrice(built.drafts, discount, []) };
  };
  const base = priceFor("cod");
  const payModes = orderPayModes(base.price.totalPaise, settings, online);
  if (payModes.length === 0) return { ok: false, error: "no_payment_mode" };
  const pay = payModes.includes(input.pay) ? input.pay : payModes[payModes.length - 1];
  const priced = pay === "online" ? priceFor("online") : base;

  return {
    ok: true,
    store,
    zone,
    zones: servedZones,
    lines: resolved.lines,
    price: priced.price,
    delivery: zone ? priced.delivery : null,
    shortOfMinimumPaise: Math.max(0, store.minOrderPaise - priced.itemsPaise),
    pay,
    payModes,
    payableNowPaise: pay === "online" ? priced.price.totalPaise : 0,
    coupon,
    couponError,
    settings,
    etaMinutes: zone ? store.prepMinutes + zone.etaMinutes : null,
  };
}

/** What the browser gets: no internal ids beyond what it sent, all money recomputed. */
export type OrderPreview = {
  ok: true;
  storeName: Store["name"];
  storeSlug: string;
  zoneId: string | null;
  zones: { id: string; name: DeliveryZone["name"]; feePaise: number; freeAbovePaise: number | null }[];
  lines: (Pick<ResolvedLine, "itemId" | "variantId" | "addonIds" | "qty" | "name" | "variantName" | "diet" | "unitPricePaise" | "lineTotalPaise"> & {
    addons: string[];
  })[];
  priceLines: Pick<PriceLine, "key" | "kind" | "description" | "amountPaise" | "discountPaise" | "taxPaise">[];
  itemsPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  delivery: DeliveryCharge | null;
  shortOfMinimumPaise: number;
  minOrderPaise: number;
  pay: OrderPaymentMode;
  payModes: OrderPaymentMode[];
  payableNowPaise: number;
  coupon: { code: string; discountPaise: number } | null;
  couponError: CouponRejection | null;
  etaMinutes: number | null;
  maxCodPaise: number;
};

export function toOrderPreview(q: OrderCheckoutQuote): OrderPreview {
  return {
    ok: true,
    storeName: q.store.name,
    storeSlug: q.store.slug,
    zoneId: q.zone?.id ?? null,
    zones: q.zones.map((z) => ({ id: z.id, name: z.name, feePaise: z.feePaise, freeAbovePaise: z.freeAbovePaise })),
    lines: q.lines.map((l) => ({
      itemId: l.itemId,
      variantId: l.variantId,
      addonIds: l.addonIds,
      qty: l.qty,
      name: l.name,
      variantName: l.variantName,
      diet: l.diet,
      unitPricePaise: l.unitPricePaise,
      lineTotalPaise: l.lineTotalPaise,
      addons: l.addons.map((a) => a.name),
    })),
    priceLines: q.price.lines.map((l) => ({
      key: l.key,
      kind: l.kind,
      description: l.description,
      amountPaise: l.amountPaise,
      discountPaise: l.discountPaise,
      taxPaise: l.taxPaise,
    })),
    itemsPaise: itemsSubtotal(q.lines),
    discountPaise: q.price.discountPaise,
    taxPaise: q.price.taxPaise,
    totalPaise: q.price.totalPaise,
    delivery: q.delivery,
    shortOfMinimumPaise: q.shortOfMinimumPaise,
    minOrderPaise: q.store.minOrderPaise,
    pay: q.pay,
    payModes: q.payModes,
    payableNowPaise: q.payableNowPaise,
    coupon: q.coupon ? { code: q.coupon.code, discountPaise: q.coupon.discountPaise } : null,
    couponError: q.couponError,
    etaMinutes: q.etaMinutes,
    maxCodPaise: q.settings.max_cod_paise,
  };
}

