import { describe, expect, it } from "vitest";
import {
  addressLine,
  canAssignRider,
  canQuote,
  canReject,
  copyDayToAll,
  deliveryErrorKey,
  deliverySettingsFormValues,
  deliverySettingsValue,
  deliveryZoneFormValues,
  deliveryZoneRow,
  isOrderLate,
  itemFormValues,
  itemRow,
  itemsSummary,
  newItemValues,
  newStoreValues,
  orderAgeMinutes,
  orderMoves,
  orderPayment,
  prescriptionTabStatuses,
  prescriptionUrl,
  quoteFormLines,
  quoteValidUntil,
  ridersFor,
  riderRow,
  settlementRange,
  settlementSummary,
  storeFormValues,
  storeHoursRows,
  storeHoursValue,
  storeRow,
} from "@/lib/delivery/admin-rows";
import { buildQuoteLines } from "@/lib/delivery/cart";
import { finalizePrice } from "@/lib/pricing/booking";
import { deliverySettingsSchema, storeHoursSchema } from "@/schemas/delivery";
import {
  addonGroupFormSchema,
  cuisinesField,
  deliverySettingsFormSchema,
  deliveryZoneFormSchema,
  itemFormSchema,
  orderBoardFiltersSchema,
  orderMoveSchema,
  prescriptionTabSchema,
  quoteFormSchema,
  riderFormSchema,
  settlementFiltersSchema,
  storeFormSchema,
  variantFormSchema,
} from "@/schemas/delivery-admin";
import type { Tables } from "@/types/database";

const STORE_ID = "11111111-1111-4111-8111-111111111111";
const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const ZONE_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";

function storeInput(over: Record<string, unknown> = {}) {
  return {
    ...newStoreValues("restaurant"),
    vendor_id: VENDOR_ID,
    slug: "brijwasi-sweets",
    name: { en: "Brijwasi Sweets", hi: "बृजवासी मिठाई" },
    cuisines: "Sweets, North Indian, Sweets",
    phone: "98765 43210",
    min_order: "149.50",
    packaging_fee: "10",
    gst_percent: "5",
    zone_ids: [ZONE_ID],
    hours: [
      { day: 2, open: "18:00", close: "02:00" },
      { day: 1, open: "09:00", close: "22:00" },
    ],
    ...over,
  };
}

describe("store form", () => {
  it("turns rupees into paise, % into basis points and sorts the hours", () => {
    const form = storeFormSchema.parse(storeInput());
    const row = storeRow(form);
    expect(row.min_order_paise).toBe(14950);
    expect(row.packaging_fee_paise).toBe(1000);
    expect(row.tax_bps).toBe(500);
    expect(row.phone).toBe("+919876543210");
    expect(row.cuisines).toEqual(["Sweets", "North Indian"]);
    expect(row.hours).toEqual([
      { day: 1, open: "09:00", close: "22:00" },
      { day: 2, open: "18:00", close: "02:00" },
    ]);
    expect(storeHoursSchema.safeParse(row.hours).success).toBe(true);
    expect(row.description).toBeNull();
    expect(row.lat).toBeNull();
  });

  it("requires a drug licence for pharmacies only (D-062)", () => {
    const pharmacy = storeFormSchema.safeParse(storeInput({ kind: "pharmacy", drug_licence_no: "" }));
    expect(pharmacy.success).toBe(false);
    expect(pharmacy.error?.issues[0]).toMatchObject({ path: ["drug_licence_no"], message: "required" });
    expect(
      storeFormSchema.safeParse(storeInput({ kind: "pharmacy", drug_licence_no: "UP-MTR-20B-1234" })).success,
    ).toBe(true);
    expect(storeFormSchema.safeParse(storeInput({ kind: "grocery" })).success).toBe(true);
  });

  it("rejects a missing vendor, a slot that opens and closes at once, and half a coordinate", () => {
    expect(storeFormSchema.safeParse(storeInput({ vendor_id: "" })).error?.issues[0].message).toBe(
      "required",
    );
    expect(
      storeFormSchema.safeParse(storeInput({ hours: [{ day: 1, open: "09:00", close: "09:00" }] })).success,
    ).toBe(false);
    expect(storeFormSchema.safeParse(storeInput({ lat: "27.58", lng: "" })).error?.issues[0].message).toBe(
      "invalidCoordinate",
    );
  });

  it("round-trips a stored store", () => {
    const form = storeFormSchema.parse(storeInput());
    const stored = {
      ...storeRow(form),
      id: STORE_ID,
      image_id: null,
      rating: null,
      deleted_at: null,
      created_at: "",
      updated_at: "",
    } as Tables<"stores">;
    const values = storeFormValues(stored, [ZONE_ID]);
    expect(values.min_order).toBe("149.50");
    expect(values.gst_percent).toBe("5");
    expect(values.cuisines).toBe("Sweets, North Indian");
    expect(storeRow(storeFormSchema.parse(values))).toEqual(storeRow(form));
  });

  it("splits cuisines and caps them", () => {
    expect(cuisinesField.parse(" Chinese ,, Thali ")).toEqual(["Chinese", "Thali"]);
    expect(cuisinesField.safeParse(Array.from({ length: 13 }, (_, i) => `C${i}`).join(",")).success).toBe(
      false,
    );
  });
});

describe("weekly hours", () => {
  it("reads stored hours, showing 24:00 as midnight, and drops invalid data", () => {
    expect(storeHoursRows([{ day: 3, open: "10:00", close: "24:00" }])).toEqual([
      { day: 3, open: "10:00", close: "00:00" },
    ]);
    expect(storeHoursRows({ nope: true })).toEqual([]);
    expect(storeHoursRows([{ day: 9, open: "10:00", close: "11:00" }])).toEqual([]);
  });

  it("copies one day's slots to the whole week", () => {
    const week = copyDayToAll(
      [
        { day: 1, open: "08:00", close: "12:00" },
        { day: 1, open: "17:00", close: "23:00" },
        { day: 4, open: "10:00", close: "11:00" },
      ],
      1,
    );
    expect(week).toHaveLength(14);
    expect(week.filter((s) => s.day === 4)).toEqual([
      { day: 4, open: "08:00", close: "12:00" },
      { day: 4, open: "17:00", close: "23:00" },
    ]);
    expect(
      storeHoursValue([
        { day: 2, open: "09:00", close: "10:00" },
        { day: 1, open: "11:00", close: "12:00" },
      ])[0].day,
    ).toBe(1);
  });
});

describe("menu forms", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    ...newItemValues(STORE_ID, null, "restaurant"),
    name: { en: "Paneer Tikka", hi: "" },
    price: "220",
    ...over,
  });

  it("maps an item to its row", () => {
    const row = itemRow(itemFormSchema.parse(item({ mrp: "250", gst_percent: "12", hsn: "2106" })));
    expect(row).toMatchObject({
      price_paise: 22000,
      mrp_paise: 25000,
      tax_bps: 1200,
      hsn: "2106",
      stock: null,
    });
    expect(itemRow(itemFormSchema.parse(item())).tax_bps).toBeNull();
  });

  it("mirrors the store_items checks", () => {
    expect(itemFormSchema.safeParse(item({ diet: "egg", is_jain: true })).error?.issues[0].path).toEqual([
      "diet",
    ]);
    expect(itemFormSchema.safeParse(item({ diet: "non_veg", is_sattvik: true })).success).toBe(false);
    expect(itemFormSchema.safeParse(item({ diet: "na", is_jain: true })).success).toBe(true);
    expect(itemFormSchema.safeParse(item({ mrp: "200" })).error?.issues[0].path).toEqual(["mrp"]);
    expect(itemFormSchema.safeParse(item({ track_stock: true, stock: "" })).error?.issues[0].path).toEqual([
      "stock",
    ]);
    expect(itemFormSchema.safeParse(item({ price: "0" })).success).toBe(false);
    expect(itemFormSchema.safeParse(item({ gst_percent: "30" })).success).toBe(false);
  });

  it("drops the count of an untracked item and round-trips a stored one", () => {
    const tracked = itemFormSchema.parse(item({ track_stock: true, stock: "12" }));
    expect(itemRow(tracked).stock).toBe(12);
    expect(itemRow({ ...tracked, track_stock: false }).stock).toBeNull();
    const stored = {
      ...itemRow(tracked),
      id: ITEM_ID,
      created_at: "",
      updated_at: "",
    } as Tables<"store_items">;
    expect(itemRow(itemFormSchema.parse(itemFormValues(stored)))).toEqual(itemRow(tracked));
  });

  it("grocery items default to n/a diet with stock tracking", () => {
    expect(newItemValues(STORE_ID, null, "grocery")).toMatchObject({ diet: "na", track_stock: true });
  });

  it("validates variants and add-on groups", () => {
    expect(
      variantFormSchema.parse({
        item_id: ITEM_ID,
        name: { en: "Half" },
        price: "120",
        stock: "",
        is_available: true,
        sort_order: 1,
      }),
    ).toMatchObject({ price: 12000, stock: null });
    expect(
      addonGroupFormSchema.safeParse({
        item_id: ITEM_ID,
        name: { en: "Extras" },
        min_select: 3,
        max_select: 2,
        sort_order: 1,
      }).success,
    ).toBe(false);
  });
});

describe("zones and riders", () => {
  it("keeps an empty free-delivery threshold as never free", () => {
    const form = deliveryZoneFormSchema.parse({
      slug: "vrindavan",
      name: { en: "Vrindavan" },
      fee: "30",
      free_above: "",
      eta_minutes: 30,
      is_active: true,
      sort_order: 1,
    });
    const row = deliveryZoneRow(form);
    expect(row).toMatchObject({ fee_paise: 3000, free_above_paise: null });
    const stored = { ...row, id: ZONE_ID, created_at: "", updated_at: "" } as Tables<"delivery_zones">;
    expect(deliveryZoneFormValues(stored).free_above).toBe("");
  });

  it("normalises the rider's phone; no vendor = platform rider", () => {
    const row = riderRow(
      riderFormSchema.parse({
        full_name: "Ramesh",
        phone: "09876543210",
        vehicle: "",
        vendor_id: "",
        is_active: true,
        notes: "",
      }),
    );
    expect(row).toMatchObject({ phone: "+919876543210", vendor_id: null, vehicle: null });
    expect(
      riderFormSchema.safeParse({ full_name: "R", phone: "123", vendor_id: "", is_active: true, notes: "" })
        .success,
    ).toBe(false);
  });

  it("offers platform riders and the order's vendor's own", () => {
    const riders = [
      { id: "a", vendorId: null },
      { id: "b", vendorId: VENDOR_ID },
      { id: "c", vendorId: "other" },
    ];
    expect(ridersFor(riders, VENDOR_ID).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("order board", () => {
  it("offers the next step, skips and reject like set_order_status", () => {
    expect(orderMoves("placed")).toEqual({ primary: "accepted", others: [] });
    expect(orderMoves("accepted")).toEqual({ primary: "preparing", others: ["ready", "out_for_delivery"] });
    expect(orderMoves("out_for_delivery")).toEqual({ primary: "delivered", others: [] });
    expect(orderMoves("delivered")).toEqual({ primary: null, others: [] });
    expect(canReject("placed")).toBe(true);
    expect(canReject("accepted")).toBe(false);
    expect(canAssignRider("ready")).toBe(true);
    expect(canAssignRider("delivered")).toBe(false);
  });

  it("requires a reason to reject", () => {
    const id = STORE_ID;
    expect(orderMoveSchema.safeParse({ orderId: id, status: "rejected" }).success).toBe(false);
    expect(orderMoveSchema.safeParse({ orderId: id, status: "rejected", note: "Closed early" }).success).toBe(
      true,
    );
    expect(orderMoveSchema.safeParse({ orderId: id, status: "accepted" }).success).toBe(true);
    expect(orderMoveSchema.safeParse({ orderId: id, status: "cancelled" }).success).toBe(false);
  });

  it("describes payment, items, age and address", () => {
    expect(orderPayment({ payment_mode: "pay_at_hotel", total_paise: 42000, paid_paise: 0 })).toEqual({
      kind: "cod",
      duePaise: 42000,
    });
    expect(orderPayment({ payment_mode: "full", total_paise: 42000, paid_paise: 42000 })).toEqual({
      kind: "online",
      paid: true,
    });
    const items = [
      { name: "Paneer Tikka", variant_name: "Half", quantity: 2 },
      { name: "Roti", variant_name: null, quantity: 4 },
      { name: "Lassi", variant_name: null, quantity: 1 },
    ];
    expect(itemsSummary(items, 2)).toEqual({ text: "2 × Paneer Tikka (Half), 4 × Roti", more: 1 });
    const now = Date.parse("2026-10-02T10:30:00Z");
    expect(
      orderAgeMinutes({ placed_at: "2026-10-02T10:00:00Z", created_at: "2026-10-02T09:00:00Z" }, now),
    ).toBe(30);
    expect(isOrderLate("placed", 6, null, now)).toBe(true);
    expect(isOrderLate("preparing", 20, "2026-10-02T10:40:00Z", now)).toBe(false);
    expect(isOrderLate("preparing", 50, "2026-10-02T10:20:00Z", now)).toBe(true);
    expect(
      addressLine({ line1: "12 Parikrama Marg", line2: "", landmark: "Near ISKCON", pincode: "281121" }),
    ).toBe("12 Parikrama Marg, Near ISKCON, 281121");
    expect(addressLine(null)).toBe("");
  });

  it("maps database errors and reads the store filter", () => {
    expect(deliveryErrorKey("partner_unavailable")).toBe("riderUnavailable");
    expect(deliveryErrorKey("invalid_transition")).toBe("invalidTransition");
    expect(deliveryErrorKey("boom")).toBe("actionFailed");
    expect(orderBoardFiltersSchema.parse({ store: "nope" })).toEqual({ store: undefined });
    expect(orderBoardFiltersSchema.parse({ store: STORE_ID })).toEqual({ store: STORE_ID });
  });
});

describe("settlements", () => {
  it("sums delivered orders per vendor with commission on the gross total", () => {
    const vendors = new Map([
      [VENDOR_ID, { name: "Brijwasi", commission_bps: 1500 }],
      ["v2", { name: "Shri Medicos", commission_bps: 1000 }],
    ]);
    const { rows, totals } = settlementSummary(
      [
        { vendor_id: VENDOR_ID, total_paise: 50_000, payment_mode: "pay_at_hotel" },
        { vendor_id: VENDOR_ID, total_paise: 30_001, payment_mode: "full" },
        { vendor_id: "v2", total_paise: 10_000, payment_mode: "full" },
      ],
      vendors,
    );
    expect(rows[0]).toMatchObject({
      vendorName: "Brijwasi",
      orders: 2,
      grossPaise: 80_001,
      commissionPaise: 12_000,
      netPaise: 68_001,
      codPaise: 50_000,
      onlinePaise: 30_001,
    });
    expect(rows[1]).toMatchObject({ vendorName: "Shri Medicos", commissionPaise: 1_000, netPaise: 9_000 });
    expect(totals).toEqual({
      orders: 3,
      grossPaise: 90_001,
      commissionPaise: 13_000,
      netPaise: 77_001,
      codPaise: 50_000,
      onlinePaise: 40_001,
    });
    expect(settlementSummary([], vendors).rows).toEqual([]);
  });

  it("defaults to this month in India and fixes reversed or too-long ranges", () => {
    const now = new Date("2026-10-02T20:00:00Z"); // 3 Oct in India
    expect(settlementRange({}, now)).toEqual({ from: "2026-10-01", to: "2026-10-03" });
    expect(settlementRange({ from: "2026-09-30", to: "2026-09-01" }, now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(settlementRange({ from: "2020-01-01", to: "2026-09-30" }, now).from).toBe("2025-09-29");
    expect(settlementFiltersSchema.parse({ from: "bad", to: "2026-09-30" })).toEqual({
      from: undefined,
      to: "2026-09-30",
    });
  });
});

describe("prescriptions and quotes", () => {
  it("maps queue tabs to statuses", () => {
    expect(prescriptionTabStatuses("open")).toEqual(["submitted", "reviewing"]);
    expect(prescriptionTabStatuses("all")).toBeNull();
    expect(prescriptionTabStatuses("quoted")).toEqual(["quoted"]);
    expect(prescriptionTabSchema.parse("whatever")).toBe("open");
    expect(canQuote("reviewing")).toBe(true);
    expect(canQuote("ordered")).toBe(false);
  });

  it("turns the quote builder into stored lines and prices them", () => {
    const form = quoteFormSchema.parse({
      prescription_id: STORE_ID,
      store_id: VENDOR_ID,
      lines: [
        { name: "Dolo 650", pack: "15 tablets", qty: 2, unit_price: "30.50", gst_percent: "12", hsn: "3004" },
        { name: "ORS", pack: "", qty: 1, unit_price: "20", gst_percent: "5", hsn: "" },
      ],
      delivery_fee: "40",
      note: "",
    });
    const lines = quoteFormLines(form);
    expect(lines[0]).toEqual({
      name: "Dolo 650",
      pack: "15 tablets",
      qty: 2,
      unit_price_paise: 3050,
      tax_bps: 1200,
      hsn: "3004",
    });
    expect(form.delivery_fee).toBe(4000);
    expect(form.note).toBeNull();
    const settings = deliverySettingsSchema.parse({});
    const price = finalizePrice(buildQuoteLines(lines, form.delivery_fee, settings, null), 0, []);
    // 6100 + 732 GST, 2000 + 100 GST, delivery 4000 + 720 GST
    expect(price.subtotalPaise).toBe(12_100);
    expect(price.taxPaise).toBe(1_552);
    expect(price.totalPaise).toBe(13_652);
  });

  it("needs a pharmacy and at least one valid line", () => {
    const base = { prescription_id: STORE_ID, store_id: "", lines: [], delivery_fee: "0", note: "" };
    expect(quoteFormSchema.safeParse(base).success).toBe(false);
    expect(
      quoteFormSchema.safeParse({
        ...base,
        store_id: VENDOR_ID,
        lines: [{ name: "X", pack: "", qty: 1, unit_price: "10", gst_percent: "12", hsn: "" }],
      }).success,
    ).toBe(false);
  });

  it("builds the customer's link and the validity", () => {
    expect(prescriptionUrl("https://example.com/", "hi", "abc")).toBe(
      "https://example.com/hi/account/prescriptions/abc",
    );
    expect(prescriptionUrl("https://example.com", "en", "abc")).toBe(
      "https://example.com/account/prescriptions/abc",
    );
    expect(quoteValidUntil(24, Date.parse("2026-10-02T00:00:00Z"))).toBe("2026-10-03T00:00:00.000Z");
  });
});

describe("delivery settings form", () => {
  it("round-trips delivery.defaults through the form", () => {
    const stored = deliverySettingsSchema.parse({});
    const values = deliverySettingsFormValues(stored);
    expect(values.max_cod).toBe("3000");
    expect(values.delivery_gst_percent).toBe("18");
    const value = deliverySettingsValue(deliverySettingsFormSchema.parse(values));
    expect(deliverySettingsSchema.parse(value)).toEqual({
      ...stored,
      medicine_notice: { en: stored.medicine_notice.en, hi: null },
    });
  });

  it("rejects bad SAC codes and out-of-range numbers", () => {
    const values = deliverySettingsFormValues(deliverySettingsSchema.parse({}));
    expect(deliverySettingsFormSchema.safeParse({ ...values, delivery_sac: "99" }).success).toBe(false);
    expect(deliverySettingsFormSchema.safeParse({ ...values, hold_minutes: 2 }).success).toBe(false);
    expect(deliverySettingsFormSchema.safeParse({ ...values, delivery_gst_percent: "40" }).success).toBe(
      false,
    );
  });
});
