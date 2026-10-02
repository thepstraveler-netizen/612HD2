import { describe, expect, it } from "vitest";
import { lineKey } from "@/lib/delivery/cart";
import type { MenuItem, Store } from "@/lib/delivery/types";
import {
  addressLine,
  cartCount,
  cartEstimatePaise,
  cartNeedsReplace,
  cartReducer,
  cartRequestLines,
  checkPrescriptionFiles,
  checkSelection,
  countShopFilters,
  EMPTY_CART,
  filterMenuItems,
  filterStores,
  freeDeliveryProgress,
  groupOrderLines,
  itemFromPaise,
  itemHasOptions,
  itemQtyInCart,
  itemSoldOut,
  menuDiets,
  orderAddress,
  orderIsLive,
  orderItemAddons,
  orderLineKey,
  orderSnapshot,
  parseMenuFilters,
  parseShopFilters,
  parseStoredCart,
  prescriptionPath,
  prescriptionStepIndex,
  safeFileName,
  selectionLabel,
  selectionUnitPaise,
  shopFilterQuery,
  showDeliveryOtp,
  storeOpenState,
  toggleShopFilter,
  weekdayName,
  withZone,
  type CartItemLine,
  type CartStoreMeta,
} from "@/lib/delivery/ui";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const ITEM_1 = "33333333-3333-4333-8333-333333333333";
const ITEM_2 = "44444444-4444-4444-8444-444444444444";
const VAR_R = "55555555-5555-4555-8555-555555555555";
const VAR_D = "66666666-6666-4666-8666-666666666666";
const ADD_1 = "77777777-7777-4777-8777-777777777777";
const ADD_2 = "88888888-8888-4888-8888-888888888888";
const GROUP = "99999999-9999-4999-8999-999999999999";
const ZONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const metaA: CartStoreMeta = { storeId: STORE_A, shop: "food", slug: "demo-a", name: { en: "A", hi: "ए" } };
const metaB: CartStoreMeta = { storeId: STORE_B, shop: "essentials", slug: "demo-b", name: { en: "B" } };

const line = (over: Partial<CartItemLine> = {}): CartItemLine => ({
  itemId: ITEM_1,
  variantId: null,
  addonIds: [],
  qty: 1,
  label: { en: "Kachori" },
  unitPaise: 6000,
  ...over,
});

const thali: MenuItem = {
  id: ITEM_1,
  categoryId: null,
  name: { en: "Braj Thali", hi: "ब्रज थाली" },
  description: null,
  imageUrl: null,
  diet: "veg",
  isJain: false,
  isSattvik: true,
  pricePaise: 22000,
  mrpPaise: null,
  taxBps: null,
  hsn: null,
  unit: null,
  trackStock: false,
  stock: null,
  isAvailable: true,
  isBestseller: true,
  variants: [
    { id: VAR_R, name: { en: "Regular", hi: "रेगुलर" }, pricePaise: 22000, stock: null, isAvailable: true },
    { id: VAR_D, name: { en: "Deluxe" }, pricePaise: 29000, stock: null, isAvailable: true },
  ],
  addonGroups: [
    {
      id: GROUP,
      name: { en: "Extras" },
      min: 0,
      max: 1,
      addons: [
        { id: ADD_1, name: { en: "Extra roti", hi: "अतिरिक्त रोटी" }, pricePaise: 1500, isAvailable: true },
        { id: ADD_2, name: { en: "Ghee" }, pricePaise: 2000, isAvailable: true },
      ],
    },
  ],
};

describe("cartReducer", () => {
  it("adds lines and merges the same item, variant and add-ons", () => {
    let s = cartReducer(EMPTY_CART, { type: "add", store: metaA, line: line() });
    s = cartReducer(s, { type: "add", store: metaA, line: line({ qty: 2 }) });
    s = cartReducer(s, { type: "add", store: metaA, line: line({ itemId: ITEM_2, unitPaise: 7000 }) });
    expect(s.store).toEqual(metaA);
    expect(s.lines).toHaveLength(2);
    expect(cartCount(s)).toBe(4);
    expect(cartEstimatePaise(s)).toBe(3 * 6000 + 7000);
    expect(itemQtyInCart(s, ITEM_1)).toBe(3);
  });

  it("treats add-ons in any order as the same line", () => {
    let s = cartReducer(EMPTY_CART, { type: "add", store: metaA, line: line({ addonIds: [ADD_2, ADD_1] }) });
    s = cartReducer(s, { type: "add", store: metaA, line: line({ addonIds: [ADD_1, ADD_2] }) });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].qty).toBe(2);
  });

  it("caps quantities at 99", () => {
    let s = cartReducer(EMPTY_CART, { type: "add", store: metaA, line: line({ qty: 90 }) });
    s = cartReducer(s, { type: "add", store: metaA, line: line({ qty: 20 }) });
    expect(s.lines[0].qty).toBe(99);
    s = cartReducer(s, { type: "setQty", key: lineKey(s.lines[0]), qty: 500 });
    expect(s.lines[0].qty).toBe(99);
  });

  it("keeps one store: adding from another store replaces the cart", () => {
    const a = cartReducer(EMPTY_CART, { type: "add", store: metaA, line: line({ qty: 3 }) });
    expect(cartNeedsReplace(a, STORE_A)).toBe(false);
    expect(cartNeedsReplace(a, STORE_B)).toBe(true);
    expect(cartNeedsReplace(EMPTY_CART, STORE_B)).toBe(false);
    const b = cartReducer(a, { type: "add", store: metaB, line: line({ itemId: ITEM_2 }) });
    expect(b.store?.storeId).toBe(STORE_B);
    expect(b.lines.map((l) => l.itemId)).toEqual([ITEM_2]);
  });

  it("removes a line at zero and empties the cart with the last one", () => {
    let s = cartReducer(EMPTY_CART, { type: "add", store: metaA, line: line({ qty: 2 }) });
    const key = lineKey(s.lines[0]);
    s = cartReducer(s, { type: "setQty", key, qty: 1 });
    expect(s.lines[0].qty).toBe(1);
    s = cartReducer(s, { type: "setQty", key, qty: 0 });
    expect(s).toEqual(EMPTY_CART);
    expect(
      cartReducer(cartReducer(EMPTY_CART, { type: "add", store: metaA, line: line() }), { type: "clear" }),
    ).toEqual(EMPTY_CART);
  });

  it("sends only ids and quantities to the server", () => {
    const s = cartReducer(EMPTY_CART, {
      type: "add",
      store: metaA,
      line: line({ variantId: VAR_D, addonIds: [ADD_1], qty: 2 }),
    });
    expect(cartRequestLines(s)).toEqual([{ itemId: ITEM_1, variantId: VAR_D, addonIds: [ADD_1], qty: 2 }]);
  });
});

describe("parseStoredCart", () => {
  it("reads back a saved cart", () => {
    const s = cartReducer(EMPTY_CART, { type: "add", store: metaA, line: line() });
    expect(parseStoredCart(JSON.stringify(s))).toEqual(s);
  });

  it("drops anything malformed", () => {
    expect(parseStoredCart(null)).toEqual(EMPTY_CART);
    expect(parseStoredCart("not json")).toEqual(EMPTY_CART);
    expect(parseStoredCart(JSON.stringify({ store: metaA, lines: [{ itemId: "x", qty: 1 }] }))).toEqual(
      EMPTY_CART,
    );
    expect(parseStoredCart(JSON.stringify({ store: metaA, lines: [] }))).toEqual(EMPTY_CART);
    expect(
      parseStoredCart(JSON.stringify({ store: { ...metaA, shop: "medicine" }, lines: [line()] })),
    ).toEqual(EMPTY_CART);
  });
});

describe("shop filters in the URL", () => {
  it("parses switches and a zone slug", () => {
    expect(parseShopFilters({ veg: "1", jain: "0", open: ["1", "0"], zone: "vrindavan" })).toEqual({
      veg: true,
      jain: false,
      sattvik: false,
      h24: false,
      open: true,
      zone: "vrindavan",
    });
    expect(parseShopFilters({ zone: "Bad Zone!" }).zone).toBeNull();
    expect(parseMenuFilters({ sattvik: "1", h24: "1" })).toEqual({ veg: false, jain: false, sattvik: true });
  });

  it("writes back only what is on, and toggles one switch", () => {
    const f = parseShopFilters({ veg: "1", zone: "mathura" });
    expect(shopFilterQuery(f)).toEqual({ veg: "1", zone: "mathura" });
    expect(toggleShopFilter(f, "veg")).toEqual({ zone: "mathura" });
    expect(toggleShopFilter(f, "h24")).toEqual({ veg: "1", h24: "1", zone: "mathura" });
    expect(withZone(f, null)).toEqual({ veg: "1" });
    expect(countShopFilters(f)).toBe(2);
  });
});

// 2026-10-05 is a Monday; 10:00 IST = 04:30 UTC.
const mondayAt = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00+05:30`);
const hours = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, open: "07:00", close: "23:00" }));

const store = (over: Partial<Store> = {}): Store => ({
  id: STORE_A,
  vendorId: STORE_B,
  kind: "restaurant",
  slug: "demo-a",
  name: { en: "A" },
  description: null,
  cuisines: [],
  imageUrl: null,
  address: null,
  phone: null,
  pureVeg: false,
  is24x7: false,
  hours,
  acceptingOrders: true,
  prepMinutes: 20,
  minOrderPaise: 0,
  packagingFeePaise: 0,
  taxBps: 500,
  drugLicenceNo: null,
  rating: null,
  isFeatured: false,
  zoneIds: [ZONE],
  ...over,
});

describe("storeOpenState", () => {
  it("is open inside today's hours", () => {
    expect(storeOpenState(store(), mondayAt("10:00"))).toEqual({ state: "open" });
  });

  it("says when it opens later today or another day", () => {
    expect(storeOpenState(store(), mondayAt("06:00"))).toEqual({
      state: "opens",
      day: 1,
      time: "07:00",
      today: true,
    });
    expect(storeOpenState(store(), mondayAt("23:30"))).toEqual({
      state: "opens",
      day: 2,
      time: "07:00",
      today: false,
    });
  });

  it("is paused when the store stops orders, and closed with no hours", () => {
    expect(storeOpenState(store({ acceptingOrders: false }), mondayAt("10:00"))).toEqual({ state: "paused" });
    expect(storeOpenState(store({ hours: [] }), mondayAt("10:00"))).toEqual({ state: "closed" });
    expect(storeOpenState(store({ hours: [], is24x7: true }), mondayAt("03:00"))).toEqual({ state: "open" });
  });

  it("names weekdays in both languages", () => {
    expect(weekdayName(1, "en")).toBe("Monday");
    expect(weekdayName(7, "en")).toBe("Sunday");
    expect(weekdayName(2, "hi")).toBe("मंगलवार");
  });
});

describe("filterStores", () => {
  const veg = store({ id: "veg", pureVeg: true });
  const allDay = store({ id: "allday", is24x7: true, zoneIds: [] });
  const paused = store({ id: "paused", acceptingOrders: false });
  const all = [veg, allDay, paused];
  const now = mondayAt("23:30");
  const run = (raw: Record<string, string>, diets?: Map<string, { jain: boolean; sattvik: boolean }>) =>
    filterStores(all, parseShopFilters(raw), { now, zoneId: raw.zone ? ZONE : null, diets }).map((s) => s.id);

  it("filters pure veg, 24×7, open now and zone", () => {
    expect(run({})).toEqual(["veg", "allday", "paused"]);
    expect(run({ veg: "1" })).toEqual(["veg"]);
    expect(run({ h24: "1" })).toEqual(["allday"]);
    expect(run({ open: "1" })).toEqual(["allday"]);
    expect(run({ zone: "vrindavan" })).toEqual(["veg", "paused"]);
  });

  it("filters Jain and Sattvik from the menus", () => {
    const diets = new Map([
      ["veg", { jain: true, sattvik: true }],
      ["allday", { jain: false, sattvik: true }],
    ]);
    expect(run({ jain: "1" }, diets)).toEqual(["veg"]);
    expect(run({ sattvik: "1" }, diets)).toEqual(["veg", "allday"]);
    expect(menuDiets([{ isJain: true, isSattvik: false, isAvailable: false }])).toEqual({
      jain: false,
      sattvik: false,
    });
  });
});

describe("menu items", () => {
  const egg: MenuItem = {
    ...thali,
    id: ITEM_2,
    diet: "egg",
    isSattvik: false,
    variants: [],
    addonGroups: [],
  };
  const water: MenuItem = { ...egg, id: "w", diet: "na", isJain: true };

  it("filters veg, Jain and Sattvik", () => {
    expect(
      filterMenuItems([thali, egg, water], { veg: true, jain: false, sattvik: false }).map((i) => i.id),
    ).toEqual([ITEM_1, "w"]);
    expect(
      filterMenuItems([thali, egg, water], { veg: false, jain: true, sattvik: false }).map((i) => i.id),
    ).toEqual(["w"]);
    expect(
      filterMenuItems([thali, egg, water], { veg: false, jain: false, sattvik: true }).map((i) => i.id),
    ).toEqual([ITEM_1]);
  });

  it("knows sold-out items, option items and the 'from' price", () => {
    expect(itemSoldOut(thali)).toBe(false);
    expect(itemSoldOut({ ...egg, trackStock: true, stock: 0 })).toBe(true);
    expect(itemSoldOut({ ...egg, isAvailable: false })).toBe(true);
    expect(itemSoldOut({ ...thali, variants: thali.variants.map((v) => ({ ...v, stock: 0 })) })).toBe(true);
    expect(itemHasOptions(thali)).toBe(true);
    expect(itemHasOptions(egg)).toBe(false);
    expect(itemFromPaise(thali)).toEqual({ paise: 22000, from: true });
    expect(itemFromPaise(egg)).toEqual({ paise: 22000, from: false });
  });

  it("checks the size and add-on limits like the server", () => {
    expect(checkSelection(thali, null, [])).toEqual({ error: "variant_required" });
    expect(checkSelection(thali, VAR_R, [])).toBeNull();
    expect(checkSelection(thali, VAR_R, [ADD_1, ADD_2])).toEqual({
      error: "addon_max",
      groupId: GROUP,
      max: 1,
    });
    const needsOne = { ...thali, addonGroups: [{ ...thali.addonGroups[0], min: 1 }] };
    expect(checkSelection(needsOne, VAR_R, [])).toEqual({ error: "addon_min", groupId: GROUP, min: 1 });
  });

  it("prices and labels a choice for display", () => {
    expect(selectionUnitPaise(thali, VAR_D, [ADD_1])).toBe(30500);
    expect(selectionUnitPaise(egg, null, [])).toBe(22000);
    expect(selectionLabel(thali, VAR_R, [ADD_1])).toEqual({
      en: "Braj Thali (Regular) + Extra roti",
      hi: "ब्रज थाली (रेगुलर) + अतिरिक्त रोटी",
    });
    expect(selectionLabel({ ...egg, name: { en: "Omelette" } }, null, [])).toEqual({
      en: "Omelette",
      hi: null,
    });
  });
});

describe("prescription files", () => {
  const pdf = { size: 1000, type: "application/pdf" };
  it("allows 1–5 images or PDFs up to 5 MB", () => {
    expect(checkPrescriptionFiles([])).toBe("empty");
    expect(checkPrescriptionFiles([pdf])).toBeNull();
    expect(checkPrescriptionFiles(Array(6).fill(pdf))).toBe("too_many");
    expect(checkPrescriptionFiles([{ size: 6 * 1024 * 1024, type: "image/png" }])).toBe("too_big");
    expect(checkPrescriptionFiles([{ size: 10, type: "image/gif" }])).toBe("bad_type");
  });

  it("builds a safe path in the user's own folder", () => {
    expect(safeFileName("Dr. Sharma Rx (1).JPG")).toBe("dr-sharma-rx-1.jpg");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\scans\\rx.png")).toBe("rx.png");
    expect(safeFileName("पर्ची.pdf")).toBe("file.pdf");
    expect(prescriptionPath("u1", "abc", "My Rx.pdf")).toBe("u1/abc-my-rx.pdf");
  });

  it("follows the review steps", () => {
    expect(prescriptionStepIndex("submitted")).toBe(0);
    expect(prescriptionStepIndex("ordered")).toBe(3);
    expect(prescriptionStepIndex("rejected")).toBe(-1);
  });
});

describe("orders", () => {
  it("reads the order snapshot leniently", () => {
    const snap = orderSnapshot({
      order: { store: { slug: "demo-a", name: { en: "A" }, kind: "restaurant", phone: null }, itemCount: 3 },
      trip: { label: "A" },
    });
    expect(snap?.order.store.kind).toBe("restaurant");
    expect(snap?.order.itemCount).toBe(3);
    expect(orderSnapshot({ trip: { label: "x", type: "one_way" } })).toBeNull();
    expect(orderSnapshot({ hotel: { name: { en: "H" } } })).toBeNull();
  });

  it("reads the address and add-ons", () => {
    const a = orderAddress({
      contact_name: "Asha",
      phone: "+91",
      line1: "Gali 2",
      line2: null,
      landmark: "Temple",
      pincode: "",
    });
    expect(a && addressLine(a)).toBe("Gali 2, Temple");
    expect(orderAddress("bad")).toBeNull();
    expect(orderItemAddons([{ name: "Ghee", price_paise: 2000 }])).toEqual(["Ghee"]);
    expect(orderItemAddons(null)).toEqual([]);
  });

  it("shows the OTP only while the order is on its way to the customer", () => {
    expect(showDeliveryOtp("confirmed", "out_for_delivery", "1234")).toBe(true);
    expect(showDeliveryOtp("confirmed", "placed", "1234")).toBe(true);
    expect(showDeliveryOtp("confirmed", "delivered", "1234")).toBe(false);
    expect(showDeliveryOtp("pending_payment", "awaiting_payment", "1234")).toBe(false);
    expect(showDeliveryOtp("confirmed", "placed", null)).toBe(false);
    expect(orderIsLive("preparing")).toBe(true);
    expect(orderIsLive("delivered")).toBe(false);
  });

  it("labels and groups price lines", () => {
    expect(orderLineKey("item:0")).toBe("items");
    expect(orderLineKey("fee:packaging")).toBe("packaging");
    expect(orderLineKey("delivery")).toBe("delivery");
    expect(orderLineKey("fee:convenience")).toBe("convenience");
    expect(orderLineKey("adjustment")).toBe("other");
    const grouped = groupOrderLines([
      { key: "item:0", amountPaise: 22000 },
      { key: "item:1", amountPaise: 6000 },
      { key: "fee:packaging", amountPaise: 1000 },
      { key: "delivery", amountPaise: 3000 },
    ]);
    expect(grouped.map((g) => [g.key, g.amountPaise])).toEqual([
      ["items", 28000],
      ["packaging", 1000],
      ["delivery", 3000],
    ]);
  });

  it("measures progress to free delivery", () => {
    expect(freeDeliveryProgress(50000, 20000)).toBeCloseTo(0.6);
    expect(freeDeliveryProgress(50000, 0)).toBe(1);
    expect(freeDeliveryProgress(null, null)).toBeNull();
  });
});
