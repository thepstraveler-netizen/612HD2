import { describe, expect, it } from "vitest";
import { finalizePrice } from "@/lib/pricing/booking";
import {
  buildCartLines,
  buildQuoteLines,
  deliveryCharge,
  describeLine,
  mergeLines,
  orderPayModes,
  resolveCart,
} from "@/lib/delivery/cart";
import { canOrderNow, isOpenAt, nextOpening } from "@/lib/delivery/hours";
import { customerCanCancel, nextStatuses, primaryNext, trackIndex } from "@/lib/delivery/status";
import type { DeliveryZone, MenuItem, Store, StoreMenu } from "@/lib/delivery/types";
import { deliverySettingsSchema, quoteLineSchema, type CartLine } from "@/schemas/delivery";

const settings = deliverySettingsSchema.parse({});

const store: Store = {
  id: "s1",
  vendorId: "v1",
  kind: "restaurant",
  slug: "thali-house",
  name: { en: "Thali House" },
  description: null,
  cuisines: [],
  imageUrl: null,
  address: null,
  phone: null,
  pureVeg: true,
  is24x7: false,
  hours: [
    { day: 1, open: "07:00", close: "23:00" },
    { day: 5, open: "18:00", close: "02:00" },
  ],
  acceptingOrders: true,
  prepMinutes: 20,
  minOrderPaise: 15_000,
  packagingFeePaise: 1000,
  taxBps: 500,
  drugLicenceNo: null,
  rating: null,
  isFeatured: false,
  zoneIds: ["z1"],
};

const item = (o: Partial<MenuItem> & { id: string }): MenuItem => ({
  categoryId: null,
  name: { en: o.id },
  description: null,
  imageUrl: null,
  diet: "veg",
  isJain: false,
  isSattvik: false,
  pricePaise: 10_000,
  mrpPaise: null,
  taxBps: null,
  hsn: null,
  unit: null,
  trackStock: false,
  stock: null,
  isAvailable: true,
  isBestseller: false,
  variants: [],
  addonGroups: [],
  ...o,
});

const menu: StoreMenu = {
  store,
  categories: [],
  items: [
    item({
      id: "thali",
      name: { en: "Braj Thali" },
      pricePaise: 22_000,
      variants: [
        { id: "reg", name: { en: "Regular" }, pricePaise: 22_000, stock: null, isAvailable: true },
        { id: "dlx", name: { en: "Deluxe" }, pricePaise: 29_000, stock: null, isAvailable: true },
      ],
      addonGroups: [
        {
          id: "g1",
          name: { en: "Extras" },
          min: 0,
          max: 2,
          addons: [
            { id: "roti", name: { en: "Extra roti" }, pricePaise: 1500, isAvailable: true },
            { id: "ghee", name: { en: "Ghee" }, pricePaise: 2000, isAvailable: true },
            { id: "gone", name: { en: "Sold out" }, pricePaise: 100, isAvailable: false },
          ],
        },
      ],
    }),
    item({ id: "peda", name: { en: "Peda" }, pricePaise: 12_000, trackStock: true, stock: 3 }),
    item({ id: "water", pricePaise: 2000, taxBps: 1800, hsn: "22011010" }),
    item({ id: "off", isAvailable: false }),
  ],
};

const zone: DeliveryZone = {
  id: "z1",
  slug: "vrindavan",
  name: { en: "Vrindavan" },
  feePaise: 3000,
  freeAbovePaise: 49_900,
  etaMinutes: 30,
};

const line = (itemId: string, qty = 1, variantId: string | null = null, addonIds: string[] = []): CartLine => ({
  itemId,
  variantId,
  addonIds,
  qty,
});

describe("cart lines", () => {
  it("merges the same item, variant and add-ons into one line", () => {
    const merged = mergeLines([
      line("thali", 1, "reg", ["roti", "ghee"]),
      line("thali", 2, "reg", ["ghee", "roti"]),
      line("thali", 1, "dlx"),
    ]);
    expect(merged.map((l) => [l.variantId, l.qty])).toEqual([
      ["reg", 3],
      ["dlx", 1],
    ]);
  });

  it("prices variants and add-ons from the menu, not from the browser", () => {
    const r = resolveCart([line("thali", 2, "dlx", ["roti", "ghee"])], menu, 30);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[0]).toMatchObject({
      unitPricePaise: 29_000 + 1500 + 2000,
      lineTotalPaise: 2 * 32_500,
      taxBps: 500,
      variantName: "Deluxe",
    });
    expect(describeLine(r.lines[0])).toBe("2 × Braj Thali (Deluxe) + Extra roti, Ghee");
  });

  it("rejects missing variants, bad add-ons, unavailable items and short stock", () => {
    expect(resolveCart([line("thali")], menu, 30)).toMatchObject({ ok: false, error: "variant_required" });
    expect(resolveCart([line("peda", 1, "reg")], menu, 30)).toMatchObject({ ok: false, error: "variant_required" });
    expect(resolveCart([line("thali", 1, "reg", ["roti", "ghee", "x"])], menu, 30)).toMatchObject({
      ok: false,
      error: "addon_invalid",
    });
    expect(resolveCart([line("thali", 1, "reg", ["gone"])], menu, 30)).toMatchObject({
      ok: false,
      error: "addon_invalid",
    });
    expect(resolveCart([line("off")], menu, 30)).toMatchObject({ ok: false, error: "item_unavailable" });
    expect(resolveCart([line("nope")], menu, 30)).toMatchObject({ ok: false, error: "item_unavailable" });
    expect(resolveCart([line("peda", 4)], menu, 30)).toMatchObject({ ok: false, error: "out_of_stock", itemId: "peda" });
    expect(resolveCart([line("peda"), line("water")], menu, 1)).toMatchObject({ ok: false, error: "too_many_lines" });
    expect(resolveCart([], menu, 30)).toMatchObject({ ok: false, error: "empty" });
  });
});

describe("cart pricing", () => {
  const resolved = (lines: ReturnType<typeof line>[]) => {
    const r = resolveCart(lines, menu, 30);
    if (!r.ok) throw new Error(r.error);
    return r.lines;
  };

  it("adds packaging and the zone's delivery fee, each taxed at its own rate", () => {
    const { drafts, itemsPaise, delivery } = buildCartLines({
      store,
      zone,
      lines: resolved([line("thali", 1, "reg")]),
      discountPaise: 0,
      settings,
      fee: null,
    });
    expect(itemsPaise).toBe(22_000);
    expect(delivery).toEqual({ feePaise: 3000, free: false, toFreePaise: 27_900 });
    const price = finalizePrice(drafts, 0, []);
    expect(price.lines.map((l) => [l.key, l.amountPaise, l.taxRateBps, l.taxPaise, l.sac])).toEqual([
      ["item:0", 22_000, 500, 1100, "996331"],
      ["fee:packaging", 1000, 500, 50, "996331"],
      ["delivery", 3000, 1800, 540, "996813"],
    ]);
    expect(price.totalPaise).toBe(22_000 + 1100 + 1000 + 50 + 3000 + 540);
  });

  it("delivers free once items after the coupon reach the threshold, and never discounts fees", () => {
    const lines = resolved([line("thali", 2, "reg"), line("peda", 1)]); // 56,000
    const free = buildCartLines({ store, zone, lines, discountPaise: 5000, settings, fee: null });
    expect(free.delivery).toEqual({ feePaise: 0, free: true, toFreePaise: 0 });
    expect(free.drafts.some((d) => d.kind === "delivery")).toBe(false);
    const paid = buildCartLines({ store, zone, lines, discountPaise: 7000, settings, fee: null });
    expect(paid.delivery.feePaise).toBe(3000);
    const price = finalizePrice(paid.drafts, 7000, []);
    expect(price.lines.filter((l) => l.kind !== "item").every((l) => l.discountPaise === 0)).toBe(true);
    expect(price.discountPaise).toBe(7000);
  });

  it("uses item GST and HSN for products and charges the convenience fee online only", () => {
    const grocery: Store = { ...store, kind: "grocery", packagingFeePaise: 0 };
    const { drafts } = buildCartLines({
      store: grocery,
      zone: { ...zone, freeAbovePaise: null },
      lines: resolved([line("water", 3)]),
      discountPaise: 0,
      settings,
      fee: { convenienceFeePaise: 2000, feeTaxBps: 1800, feeSac: "998552" },
    });
    expect(drafts.map((d) => [d.key, d.sac, d.tax])).toEqual([
      ["item:0", "22011010", { mode: "fixed", rateBps: 1800 }],
      ["delivery", "996813", { mode: "fixed", rateBps: 1800 }],
      ["fee:convenience", "998552", { mode: "fixed", rateBps: 1800 }],
    ]);
  });

  it("reports when a zone never delivers free", () => {
    expect(deliveryCharge({ ...zone, freeAbovePaise: null }, 1_000_000)).toEqual({
      feePaise: 3000,
      free: false,
      toFreePaise: null,
    });
    expect(deliveryCharge({ ...zone, feePaise: 0, freeAbovePaise: null }, 100).feePaise).toBe(0);
  });

  it("offers cash on delivery up to the limit and online only with Razorpay", () => {
    expect(orderPayModes(50_000, settings, true)).toEqual(["online", "cod"]);
    expect(orderPayModes(400_000, settings, true)).toEqual(["online"]);
    expect(orderPayModes(50_000, settings, false)).toEqual(["cod"]);
    expect(orderPayModes(50_000, { ...settings, cod_enabled: false }, false)).toEqual([]);
  });

  it("prices a medicine quote line by line with its own GST", () => {
    const lines = [
      quoteLineSchema.parse({ name: "Paracetamol 650", pack: "15 tablets", qty: 2, unit_price_paise: 3000, tax_bps: 1200 }),
      quoteLineSchema.parse({ name: "ORS", qty: 1, unit_price_paise: 2500, tax_bps: 500, hsn: "30049099" }),
    ];
    const price = finalizePrice(buildQuoteLines(lines, 2000, settings, null), 0, []);
    expect(price.lines.map((l) => [l.description, l.amountPaise, l.taxPaise, l.sac])).toEqual([
      ["2 × Paracetamol 650 (15 tablets)", 6000, 720, "996211"],
      ["1 × ORS", 2500, 125, "30049099"],
      ["Delivery", 2000, 360, "996813"],
    ]);
  });
});

describe("opening hours (India time)", () => {
  // 2026-12-07 is a Monday.
  const at = (local: string) => new Date(`${local}:00+05:30`);

  it("is open inside today's slot and closed outside it", () => {
    expect(isOpenAt(store, at("2026-12-07T07:00"))).toBe(true);
    expect(isOpenAt(store, at("2026-12-07T22:59"))).toBe(true);
    expect(isOpenAt(store, at("2026-12-07T23:00"))).toBe(false);
    expect(isOpenAt(store, at("2026-12-08T12:00"))).toBe(false); // Tuesday: no slot
  });

  it("handles slots that run past midnight", () => {
    expect(isOpenAt(store, at("2026-12-11T23:30"))).toBe(true); // Friday night
    expect(isOpenAt(store, at("2026-12-12T01:30"))).toBe(true); // early Saturday
    expect(isOpenAt(store, at("2026-12-12T02:00"))).toBe(false);
  });

  it("is always open when 24×7 but not while paused", () => {
    const allDay = { ...store, is24x7: true, hours: [] };
    expect(isOpenAt(allDay, at("2026-12-08T03:00"))).toBe(true);
    expect(canOrderNow({ ...allDay, acceptingOrders: false }, at("2026-12-08T03:00"))).toBe(false);
  });

  it("finds the next opening", () => {
    expect(nextOpening(store, at("2026-12-07T05:00"))).toEqual({ day: 1, time: "07:00", today: true });
    expect(nextOpening(store, at("2026-12-07T23:30"))).toEqual({ day: 5, time: "18:00", today: false });
    expect(nextOpening({ ...store, is24x7: true }, at("2026-12-07T05:00"))).toBeNull();
  });
});

describe("order status", () => {
  it("mirrors the database transitions and the customer tracker", () => {
    expect(nextStatuses("placed")).toEqual(["accepted", "rejected"]);
    expect(nextStatuses("delivered")).toEqual([]);
    expect(primaryNext("preparing")).toBe("ready");
    expect(trackIndex("ready")).toBe(trackIndex("preparing"));
    expect(trackIndex("cancelled")).toBe(-1);
  });

  it("lets customers cancel only before the store accepts", () => {
    expect(customerCanCancel("placed", settings)).toBe(true);
    expect(customerCanCancel("accepted", settings)).toBe(false);
    expect(customerCanCancel("placed", { cancel_until: "never" })).toBe(false);
    expect(customerCanCancel("awaiting_payment", { cancel_until: "never" })).toBe(true);
  });
});
