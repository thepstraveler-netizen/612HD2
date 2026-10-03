/**
 * Acceptance: prices are always computed on the server.
 *
 * Each test drives the real customer booking action (bookHotel, bookCab,
 * bookRide, placeOrder, bookPackage) through the real server checkout
 * (prepare*Checkout → pricing engines → booking service → Razorpay order),
 * with only the catalog reads, the session and the outside world (Supabase
 * RPC, Razorpay REST) replaced. The browser sends forged totals, prices and
 * discounts; the test checks that:
 *   1. a forged `expectedTotalPaise` is refused with `price_changed` and nothing
 *      is written or charged, and
 *   2. forged price fields anywhere in the payload are dropped by the zod
 *      schemas, so the booking row, its line items and the Razorpay order
 *      carry exactly the server's numbers.
 * The database then re-checks that the lines add up (tests/db/bookings.test.ts
 * "rejects line items that do not add up to the totals") and that a captured
 * amount equals the order (… "ignores a captured amount that differs from the order").
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { indexCalendar } from "@/lib/availability/engine";
import type { CabCatalog } from "@/lib/cabs/queries";
import type { StoreMenu, DeliveryZone } from "@/lib/delivery/types";
import type { CatalogHotel, HotelCatalog } from "@/lib/hotels/types";
import type { PackageDetail } from "@/lib/packages/types";
import { DEFAULT_GST_SLABS } from "@/lib/pricing/tax";
import type { RideCatalog } from "@/lib/rides/queries";
import { invoiceSettingsSchema, paymentSettingsSchema } from "@/schemas/booking";
import { cabSettingsSchema } from "@/schemas/cabs";
import { deliverySettingsSchema } from "@/schemas/delivery";
import { hotelSearchDefaultsSchema } from "@/schemas/hotels";
import { packagesSettingsSchema } from "@/schemas/packages";
import { rideSettingsSchema } from "@/schemas/rides";

type RpcCall = { name: string; args: Record<string, unknown> };

const h = vi.hoisted(() => ({
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  orders: [] as { amountPaise: number }[],
  catalog: {} as Record<string, unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: () => undefined,
  revalidatePath: () => undefined,
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({
    user: { id: "11111111-1111-4111-8111-111111111111", email: "guest@example.com" },
    profile: { is_blocked: false },
  }),
}));
vi.mock("@/lib/notifications/service", () => ({ notify: async () => undefined }));
vi.mock("@/lib/catalog/queries", () => ({ CATALOG_TAG: "catalog" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => null }));
vi.mock("@/lib/supabase/admin", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "order", "limit", "update", "insert", "upsert"])
    chain[m] = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.single = async () => ({ data: null, error: null });
  chain.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return {
    createAdminClient: () => ({
      from: () => chain,
      rpc: async (name: string, args: Record<string, unknown> = {}) => {
        h.rpc.push({ name, args });
        if (name.startsWith("create_")) {
          const booking = args.p_booking as { code: string };
          return {
            data: {
              id: crypto.randomUUID(),
              code: booking.code,
              status: "pending_payment",
              order_id: crypto.randomUUID(),
            },
            error: null,
          };
        }
        if (name === "attach_payment_order") return { data: crypto.randomUUID(), error: null };
        if (name === "expire_stale_bookings") return { data: 0, error: null };
        return { data: null, error: null };
      },
    }),
  };
});
vi.mock("@/lib/payments/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/razorpay")>()),
  createOrder: async (_config: unknown, o: { amountPaise: number }) => {
    h.orders.push({ amountPaise: o.amountPaise });
    return { id: `order_${h.orders.length}`, amount: o.amountPaise };
  },
}));
vi.mock("@/lib/coupons/check", () => ({
  // The server's coupon table: only SAVE50 exists, worth ₹50 off.
  checkCoupon: async (code: string) =>
    code === "SAVE50"
      ? { coupon: { id: "22222222-2222-4222-8222-222222222222", code, discountPaise: 5000 }, error: null }
      : { coupon: null, error: "not_found" },
}));
vi.mock("@/lib/bookings/settings", async () => {
  const { paymentSettingsSchema: pay, invoiceSettingsSchema: inv } = await import("@/schemas/booking");
  return {
    getFeatureFlag: async () => true,
    getPaymentSettings: async () => pay.parse({}),
    getInvoiceSettings: async () => inv.parse({}),
  };
});
vi.mock("@/lib/hotels/queries", () => ({
  HOTEL_CALENDAR_TAG: "hotel-calendar",
  getHotelCatalog: async () => h.catalog.hotels,
  getHotelSearchDefaults: async () => h.catalog.hotelDefaults,
  getGstSlabs: async () => h.catalog.gst,
  getHotelCalendar: async (hotels: CatalogHotel[]) =>
    indexCalendar(
      [],
      [],
      hotels.flatMap((x) => x.rules),
    ),
}));
vi.mock("@/lib/cabs/queries", () => ({
  getCabCatalog: async () => h.catalog.cabs,
  getCabSettings: async () => h.catalog.cabSettings,
}));
vi.mock("@/lib/rides/queries", () => ({
  getRideCatalog: async () => h.catalog.rides,
  getRideSettings: async () => h.catalog.rideSettings,
}));
vi.mock("@/lib/delivery/queries", () => ({
  getLiveStoreMenu: async (id: string) =>
    (h.catalog.menu as StoreMenu).store.id === id ? h.catalog.menu : null,
  getDeliveryZones: async () => h.catalog.zones,
  getDeliverySettings: async () => h.catalog.deliverySettings,
}));
vi.mock("@/lib/packages/queries", () => ({
  getLivePackage: async (slug: string) =>
    (h.catalog.pkg as PackageDetail).slug === slug ? h.catalog.pkg : null,
  getPackagesSettings: async () => h.catalog.packagesSettings,
}));

// ---------------------------------------------------------------- server-side catalog

const HOTEL_PLAN = "33333333-3333-4333-8333-333333333333";
const hotel: CatalogHotel = {
  id: "44444444-4444-4444-8444-444444444444",
  slug: "radha-kunj",
  name: { en: "Radha Kunj" },
  summary: null,
  description: null,
  propertyType: "hotel",
  starRating: 3,
  cityId: "vrindavan",
  areaId: null,
  address: null,
  lat: 27.58,
  lng: 77.7,
  checkInTime: "12:00",
  checkOutTime: "11:00",
  highlights: [],
  foodDining: null,
  policies: {
    unmarried_couples_allowed: true,
    bachelors_allowed: true,
    local_ids_allowed: true,
    pets_allowed: false,
    id_proofs: [],
    rules: [],
  },
  isCoupleFriendly: false,
  isFeatured: false,
  isSponsored: false,
  payAtHotel: false,
  partPaymentPercent: null,
  addonPrices: { early_checkin: null, late_checkout: null, breakfast: 30_000 },
  ratingAvg: 4,
  ratingCount: 10,
  sortOrder: 0,
  seo: {},
  amenityIds: [],
  images: [],
  rooms: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      name: { en: "Deluxe" },
      description: null,
      bedType: null,
      sizeSqft: null,
      baseOccupancy: 2,
      maxAdults: 3,
      maxChildren: 2,
      maxOccupancy: 4,
      totalUnits: 3,
      amenityIds: [],
      sortOrder: 0,
      isActive: true,
    },
  ],
  plans: [
    {
      id: HOTEL_PLAN,
      roomId: "55555555-5555-4555-8555-555555555555",
      name: { en: "Room only" },
      inclusions: [],
      mealPlan: "room_only",
      isRefundable: false,
      cancellationRules: [],
      basePricePaise: 200_000,
      extraAdultPaise: 0,
      extraChildPaise: 0,
      minStay: 1,
      maxStay: null,
      sortOrder: 0,
      isActive: true,
    },
  ],
  rules: [],
};

const fareRule = (rate: number) => ({
  ratePerKmPaise: rate,
  minKm: 80,
  minKmPerDay: 250,
  driverAllowancePerDayPaise: 30_000,
  nightChargePaise: 25_000,
  extraKmPaise: rate,
  tollsIncluded: false,
  waitingFreeMinutes: 45,
  waitingPerHourPaise: 10_000,
});
const cabs: CabCatalog = {
  places: [
    {
      id: "p-vrn",
      slug: "vrindavan",
      name: { en: "Vrindavan" },
      kind: "city",
      lat: 27.565,
      lng: 77.6593,
      isPopular: true,
    },
    {
      id: "p-agr",
      slug: "agra",
      name: { en: "Agra" },
      kind: "city",
      lat: 27.1767,
      lng: 78.0081,
      isPopular: true,
    },
  ],
  categories: [
    {
      id: "c-sedan",
      key: "sedan",
      name: { en: "Sedan" },
      description: null,
      bodyType: "sedan",
      seats: 4,
      luggage: 2,
      isAc: true,
      image: null,
      models: [],
      rules: { one_way: fareRule(1300) },
    },
  ],
  routes: [
    {
      id: "r-agra",
      slug: "vrindavan-agra",
      tripType: "one_way",
      fromId: "p-vrn",
      toId: "p-agr",
      name: null,
      description: null,
      stops: [],
      distanceKm: 75,
      durationMinutes: 105,
      isPopular: true,
      fares: { "c-sedan": { farePaise: 150_000, extraKmPaise: 1300, tollsIncluded: true } },
    },
  ],
  packages: [],
  addons: [],
  surcharges: [],
};

const rideRule = {
  basePaise: 3000,
  includedKm: 2,
  perKmPaise: 800,
  minFarePaise: 3000,
  hourlyRatePaise: 15_000,
  minHours: 1,
  kmPerHour: 10,
  freeWaitingMinutes: 5,
  perMinWaitingPaise: 100,
  nightBps: 12_500,
};
const rides: RideCatalog = {
  types: [
    {
      id: "t-bike",
      key: "bike",
      serviceSlug: "bike",
      name: { en: "Bike" },
      description: null,
      icon: "bike",
      seats: 1,
      instantBook: true,
      taxBps: 500,
    },
  ],
  zones: [{ id: "z-vrn", slug: "vrindavan", name: { en: "Vrindavan" }, lat: 27.58, lng: 77.69, radiusKm: 8 }],
  points: [
    {
      id: "p-isk",
      zoneId: "z-vrn",
      slug: "iskcon",
      name: { en: "ISKCON Temple" },
      kind: "temple",
      lat: 27.5724,
      lng: 77.6738,
      isPopular: true,
    },
    {
      id: "p-bb",
      zoneId: "z-vrn",
      slug: "banke-bihari",
      name: { en: "Banke Bihari Temple" },
      kind: "temple",
      lat: 27.5806,
      lng: 77.7006,
      isPopular: true,
    },
  ],
  fares: [{ ...rideRule, zoneId: "z-vrn", vehicleTypeId: "t-bike", mode: "point_to_point" }],
};

const STORE = "66666666-6666-4666-8666-666666666666";
const ZONE = "77777777-7777-4777-8777-777777777777";
const THALI = "88888888-8888-4888-8888-888888888888";
const zone: DeliveryZone = {
  id: ZONE,
  slug: "vrindavan",
  name: { en: "Vrindavan" },
  feePaise: 3000,
  freeAbovePaise: null,
  etaMinutes: 30,
};
const menu: StoreMenu = {
  store: {
    id: STORE,
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
    is24x7: true,
    hours: [],
    acceptingOrders: true,
    prepMinutes: 20,
    minOrderPaise: 10_000,
    packagingFeePaise: 1000,
    taxBps: 500,
    drugLicenceNo: null,
    rating: null,
    isFeatured: false,
    zoneIds: [ZONE],
  },
  categories: [],
  items: [
    {
      id: THALI,
      categoryId: null,
      name: { en: "Braj Thali" },
      description: null,
      imageUrl: null,
      diet: "veg",
      isJain: false,
      isSattvik: false,
      pricePaise: 22_000,
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
    },
  ],
};

const pkg: PackageDetail = {
  id: "99999999-9999-4999-8999-999999999999",
  slug: "braj-darshan",
  title: { en: "Braj Darshan" },
  summary: { en: "Two days in Braj" },
  category: "pilgrimage",
  destinations: ["Vrindavan"],
  startCity: "Mathura",
  days: 2,
  nights: 1,
  imageUrl: null,
  bookingMode: "book",
  fixedDepartures: false,
  fromPaise: 599_900,
  rating: null,
  isFeatured: false,
  nextDeparture: null,
  description: null,
  gallery: [],
  highlights: [],
  inclusions: [],
  exclusions: [],
  terms: null,
  minPax: 1,
  maxPax: 12,
  advancePercent: null,
  taxBps: 500,
  sac: "998555",
  tiers: [{ id: "t1", minPax: 1, maxPax: 4, adultPricePaise: 599_900, childPricePaise: null }],
  departures: [],
  itinerary: [],
};

// ---------------------------------------------------------------- harness

/** Fields a tampered browser adds to every payload; none may reach the price. */
const FORGED = {
  totalPaise: 1,
  total_paise: 1,
  subtotalPaise: 1,
  payableNowPaise: 1,
  discountPaise: 9_999_999,
  amount_paise: 1,
  price: { totalPaise: 1, lines: [] },
};

const createCall = (): RpcCall | undefined => h.rpc.find((c) => c.name.startsWith("create_"));

/** Checks the booking write and the Razorpay order carry the server's total, line by line. */
function expectChargedServerPrice(total: number) {
  const call = createCall();
  expect(call).toBeDefined();
  const booking = call?.args.p_booking as Record<string, number>;
  const items = call?.args.p_items as { amount_paise: number; discount_paise: number; tax_paise: number }[];
  expect(booking.total_paise).toBe(total);
  expect(booking.subtotal_paise - booking.discount_paise + booking.tax_paise).toBe(total);
  expect(items.reduce((s, i) => s + i.amount_paise, 0)).toBe(booking.subtotal_paise);
  expect(items.reduce((s, i) => s + i.tax_paise, 0)).toBe(booking.tax_paise);
  expect(h.orders).toEqual([{ amountPaise: booking.payable_now_paise }]);
  const attach = h.rpc.find((c) => c.name === "attach_payment_order");
  expect(attach?.args.p_amount).toBe(booking.payable_now_paise);
  return booking;
}

function expectNothingWritten() {
  expect(createCall()).toBeUndefined();
  expect(h.orders).toEqual([]);
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-01T04:30:00Z")); // 10:00 India time
  h.catalog = {
    hotels: { hotels: [hotel], amenities: [], cities: [], areas: [] } satisfies HotelCatalog,
    hotelDefaults: hotelSearchDefaultsSchema.parse({}),
    gst: DEFAULT_GST_SLABS,
    cabs,
    cabSettings: cabSettingsSchema.parse({}),
    rides,
    rideSettings: rideSettingsSchema.parse({}),
    menu,
    zones: [zone],
    deliverySettings: deliverySettingsSchema.parse({}),
    pkg,
    packagesSettings: packagesSettingsSchema.parse({}),
  };
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
  vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_key");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_secret");
  h.rpc.length = 0;
  h.orders.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

// Sanity: the settings the expected numbers below rely on.
it("uses default payment settings (no convenience fee)", () => {
  expect(paymentSettingsSchema.parse({}).convenience_fee_paise).toBe(0);
  expect(invoiceSettingsSchema.parse({}).sac_accommodation).toBeTruthy();
});

describe("server-side pricing under tampering", () => {
  it("hotel: charges 2 nights × ₹2,000 + GST whatever the browser sends", async () => {
    const { bookHotel } = await import("@/lib/bookings/actions");
    const checkout = {
      hotel: "radha-kunj",
      plan: HOTEL_PLAN,
      checkin: "2026-12-10",
      checkout: "2026-12-12",
      rooms: 1,
      adults: 2,
      paymentMode: "full",
      ...FORGED,
    };
    const guest = { name: "Test Guest", phone: "9876543210", acceptPolicies: true, ...FORGED };

    const forged = await bookHotel({ checkout, guest, expectedTotalPaise: 1 });
    expect(forged).toMatchObject({ ok: false, error: "price_changed" });
    expectNothingWritten();
    // ₹4,000 room charges; ₹2,000/night is in the 5% hotel GST slab → ₹200.
    const serverTotal = 420_000;
    expect(forged.ok === false && forged.preview?.totalPaise).toBe(serverTotal);

    const booked = await bookHotel({ checkout, guest, expectedTotalPaise: serverTotal });
    expect(booked).toMatchObject({
      ok: true,
      status: "pending_payment",
      order: { amountPaise: serverTotal },
    });
    expect(expectChargedServerPrice(serverTotal)).toMatchObject({
      subtotal_paise: 400_000,
      discount_paise: 0,
    });
  });

  it("hotel: a forged coupon or discount does not lower the price", async () => {
    const { bookHotel } = await import("@/lib/bookings/actions");
    const base = {
      hotel: "radha-kunj",
      plan: HOTEL_PLAN,
      checkin: "2026-12-10",
      checkout: "2026-12-12",
      rooms: 1,
      adults: 2,
      paymentMode: "full",
    };
    const guest = { name: "Test Guest", phone: "9876543210", acceptPolicies: true };
    // Unknown code: refused, nothing written.
    const unknown = await bookHotel({
      checkout: { ...base, coupon: "FREE100", discountPaise: 400_000 },
      guest,
      expectedTotalPaise: 0,
    });
    expect(unknown).toMatchObject({ ok: false, error: "coupon" });
    expectNothingWritten();
    // Real code: the server's ₹50, not the browser's figure.
    const real = await bookHotel({
      checkout: { ...base, coupon: "SAVE50", discountPaise: 400_000 },
      guest,
      expectedTotalPaise: 414_750,
    });
    expect(real).toMatchObject({ ok: true });
    expect(expectChargedServerPrice(414_750)).toMatchObject({ discount_paise: 5000 });
  });

  it("cab: charges the route's fixed fare + GST", async () => {
    const { bookCab } = await import("@/lib/cabs/actions");
    const checkout = {
      type: "one_way",
      from: "vrindavan",
      to: "agra",
      at: "2026-12-05T09:00",
      pax: 2,
      category: "sedan",
      paymentMode: "full",
      ...FORGED,
    };
    const passenger = {
      name: "Test Guest",
      email: "guest@example.com",
      phone: "9876543210",
      pickupAddress: "Gate 2, ISKCON",
      ...FORGED,
    };
    const forged = await bookCab({ checkout, passenger, expectedTotalPaise: 100 });
    expect(forged).toMatchObject({ ok: false, error: "price_changed" });
    expectNothingWritten();
    const serverTotal = 157_500; // ₹1,500 fixed fare + 5% GST
    const booked = await bookCab({ checkout, passenger, expectedTotalPaise: serverTotal });
    expect(booked).toMatchObject({ ok: true, order: { amountPaise: serverTotal } });
    expectChargedServerPrice(serverTotal);
  });

  it("ride: charges the zone fare for the estimated distance", async () => {
    const { bookRide, previewRideCheckout } = await import("@/lib/rides/actions");
    const checkout = { v: "bike", from: "iskcon", to: "banke-bihari", pay: "online", ...FORGED };
    const passenger = { name: "Test Guest", phone: "9876543210", pickupAddress: "ISKCON gate", ...FORGED };
    const preview = await previewRideCheckout(checkout);
    if (!preview.ok) throw new Error(preview.error);
    const serverTotal = preview.totalPaise;
    expect(serverTotal).toBeGreaterThan(3000); // at least the minimum fare
    const forged = await bookRide({ checkout, passenger, expectedTotalPaise: 1 });
    expect(forged).toMatchObject({ ok: false, error: "price_changed" });
    expectNothingWritten();
    const booked = await bookRide({ checkout, passenger, expectedTotalPaise: serverTotal });
    expect(booked).toMatchObject({ ok: true, status: "pending_payment" });
    expectChargedServerPrice(serverTotal);
  });

  it("food order: prices lines from the live menu, ignoring browser unit prices", async () => {
    const { placeOrder } = await import("@/lib/delivery/actions");
    const checkout = {
      storeId: STORE,
      lines: [{ itemId: THALI, qty: 2, unitPricePaise: 1, lineTotalPaise: 1, pricePaise: 1 }],
      pay: "online",
      address: {
        contactName: "Test Guest",
        phone: "9876543210",
        line1: "12 Parikrama Marg",
        zoneId: ZONE,
        feePaise: 0,
      },
      ...FORGED,
    };
    const forged = await placeOrder({ checkout, expectedTotalPaise: 2 });
    expect(forged).toMatchObject({ ok: false, error: "price_changed" });
    expectNothingWritten();
    const serverTotal = forged.ok === false ? forged.preview?.totalPaise : undefined;
    // Items ₹440 + packaging ₹10 + delivery ₹30, each line taxed by the store.
    expect(serverTotal).toBeGreaterThanOrEqual(44_000 + 1000 + 3000);
    const booked = await placeOrder({ checkout, expectedTotalPaise: serverTotal });
    expect(booked).toMatchObject({ ok: true, status: "pending_payment" });
    expectChargedServerPrice(serverTotal ?? -1);
    expect(createCall()?.args.p_order_items).toMatchObject([
      { item_id: THALI, quantity: 2, unit_price_paise: 22_000, line_total_paise: 44_000 },
    ]);
  });

  it("package quote: prices the tier on the server and takes the advance it decides", async () => {
    const { bookPackage, previewPackageBooking } = await import("@/lib/packages/actions");
    const checkout = {
      packageSlug: "braj-darshan",
      startDate: "2026-12-20",
      adults: 2,
      paymentMode: "part",
      ...FORGED,
    };
    const details = { name: "Test Guest", phone: "9876543210", acceptPolicies: true, ...FORGED };
    const preview = await previewPackageBooking(checkout);
    if (!preview.ok) throw new Error(preview.error);
    // 2 adults × ₹5,999 + 5% GST.
    expect(preview.totalPaise).toBe(Math.round(2 * 599_900 * 1.05));
    const forged = await bookPackage({ checkout, details, expectedTotalPaise: 1 });
    expect(forged).toMatchObject({ ok: false, error: "price_changed" });
    expectNothingWritten();
    const booked = await bookPackage({ checkout, details, expectedTotalPaise: preview.totalPaise });
    expect(booked).toMatchObject({ ok: true, order: { amountPaise: preview.payableNowPaise } });
    const row = expectChargedServerPrice(preview.totalPaise);
    expect(row.payable_now_paise).toBeLessThan(preview.totalPaise);
  });
});
