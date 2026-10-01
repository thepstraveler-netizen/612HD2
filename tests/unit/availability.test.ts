import { describe, expect, it } from "vitest";
import {
  bestOffer,
  distributeGuests,
  indexCalendar,
  nightlyRate,
  quoteStay,
  startingPrice,
  type InventoryDay,
  type PricingRule,
  type RatePlan,
  type RoomType,
  type StayRequest,
} from "@/lib/availability/engine";
import { addDays, daysBetween, isIsoDate, isoWeekday, stayNights, todayInIndia } from "@/lib/dates";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import { DEFAULT_GST_SLABS, gstForRoomNight, gstRateBps } from "@/lib/pricing/tax";

const room: RoomType = {
  id: "deluxe",
  baseOccupancy: 2,
  maxAdults: 3,
  maxChildren: 2,
  maxOccupancy: 4,
  totalUnits: 5,
  isActive: true,
};

const plan: RatePlan = {
  id: "deluxe-ep",
  roomId: "deluxe",
  mealPlan: "room_only",
  isRefundable: true,
  cancellationRules: [{ hours_before: 48, refund_percent: 100 }],
  basePricePaise: 200_000, // ₹2,000
  extraAdultPaise: 50_000,
  extraChildPaise: 30_000,
  minStay: 1,
  maxStay: null,
  isActive: true,
};

const rule = (overrides: Partial<PricingRule>): PricingRule => ({
  id: "r",
  roomId: null,
  ratePlanId: null,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  weekdays: [],
  adjustment: "percent",
  value: 0,
  priority: 0,
  isActive: true,
  ...overrides,
});

const stay = (overrides: Partial<StayRequest> = {}): StayRequest => ({
  checkIn: "2026-11-02", // Monday
  checkOut: "2026-11-04",
  rooms: 1,
  adults: 2,
  children: 0,
  ...overrides,
});

const empty = indexCalendar([], [], []);

describe("dates", () => {
  it("counts nights and weekdays on the calendar", () => {
    expect(stayNights("2026-11-02", "2026-11-05")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(stayNights("2026-11-05", "2026-11-02")).toEqual([]);
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isoWeekday("2026-11-01")).toBe(7);
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });

  it("uses India's calendar for today", () => {
    expect(todayInIndia(new Date("2026-10-01T19:00:00Z"))).toBe("2026-10-02");
    expect(todayInIndia(new Date("2026-10-01T18:00:00Z"))).toBe("2026-10-01");
  });
});

describe("money and GST", () => {
  it("formats and parses rupees", () => {
    expect(formatPaise(123_400)).toBe("₹1,234");
    expect(formatPaise(123_450)).toBe("₹1,234.50");
    expect(formatPaise(1_00_00_000)).toBe("₹1,00,000");
    expect(rupeesToPaise("1,499.5")).toBe(149_950);
    expect(rupeesToPaise("abc")).toBeNull();
  });

  it("picks the GST slab by room-night tariff", () => {
    expect(gstRateBps(DEFAULT_GST_SLABS, 100_000)).toBe(0);
    expect(gstRateBps(DEFAULT_GST_SLABS, 100_001)).toBe(500);
    expect(gstRateBps(DEFAULT_GST_SLABS, 750_000)).toBe(500);
    expect(gstRateBps(DEFAULT_GST_SLABS, 750_001)).toBe(1_800);
    expect(gstForRoomNight(DEFAULT_GST_SLABS, 200_000)).toBe(10_000);
  });
});

describe("nightly rates", () => {
  it("applies the best pricing rule, and a per-date override beats rules", () => {
    const weekend = rule({ id: "weekend", weekdays: [6, 7], adjustment: "percent", value: 2_500 });
    const kartik = rule({
      id: "kartik",
      startDate: "2026-10-26",
      endDate: "2026-11-24",
      adjustment: "flat",
      value: 50_000,
      priority: 5,
    });
    const calendar = indexCalendar(
      [],
      [{ ratePlanId: plan.id, date: "2026-11-03", pricePaise: 150_000 }],
      [weekend, kartik],
    );
    expect(nightlyRate(plan, "2026-10-03", calendar)).toBe(250_000); // Saturday: +25%
    expect(nightlyRate(plan, "2026-10-05", calendar)).toBe(200_000); // Monday, no season
    expect(nightlyRate(plan, "2026-11-02", calendar)).toBe(250_000); // Kartik +₹500 wins on priority
    expect(nightlyRate(plan, "2026-11-03", calendar)).toBe(150_000); // explicit override
  });

  it("prefers the most specific rule at equal priority and ignores other plans", () => {
    const hotelWide = rule({ id: "h", adjustment: "fixed", value: 300_000 });
    const planOnly = rule({ id: "p", ratePlanId: plan.id, adjustment: "fixed", value: 280_000 });
    const otherPlan = rule({ id: "o", ratePlanId: "other", adjustment: "fixed", value: 1, priority: 9 });
    const calendar = indexCalendar([], [], [hotelWide, planOnly, otherPlan]);
    expect(nightlyRate(plan, "2026-06-01", calendar)).toBe(280_000);
  });
});

describe("guest distribution", () => {
  it("spreads guests and rejects parties that do not fit", () => {
    expect(distributeGuests(room, stay({ rooms: 2, adults: 3, children: 1 }))).toEqual([
      { adults: 2, children: 0 },
      { adults: 1, children: 1 },
    ]);
    expect(distributeGuests(room, stay({ adults: 4 }))).toBeNull();
    expect(distributeGuests(room, stay({ rooms: 2, adults: 1 }))).toBeNull();
  });
});

describe("quoteStay", () => {
  it("prices a stay with extra guests and per-room-night GST", () => {
    const quote = quoteStay(room, plan, stay({ adults: 3, children: 1 }), empty, DEFAULT_GST_SLABS);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.roomChargesPaise).toBe(400_000);
    expect(quote.extraGuestPaise).toBe(2 * (50_000 + 30_000));
    // Room-night tariff ₹2,800 → 5% GST.
    expect(quote.taxPaise).toBe(2 * 14_000);
    expect(quote.totalPaise).toBe(400_000 + 160_000 + 28_000);
    expect(quote.avgNightlyPaise).toBe(200_000);
    expect(quote.freeCancellation).toBe(true);
    expect(quote.unitsLeft).toBe(5);
  });

  it("blocks sold-out, closed and short stays", () => {
    const inventory: InventoryDay[] = [
      { roomId: room.id, date: "2026-11-03", units: 2, soldUnits: 2, isClosed: false, minStay: null },
    ];
    expect(quoteStay(room, plan, stay(), indexCalendar(inventory, [], []), DEFAULT_GST_SLABS)).toEqual({
      ok: false,
      reason: "sold_out",
    });
    const closed = [{ ...inventory[0], soldUnits: 0, isClosed: true }];
    expect(quoteStay(room, plan, stay(), indexCalendar(closed, [], []), DEFAULT_GST_SLABS)).toEqual({
      ok: false,
      reason: "closed",
    });
    const minStay = [{ ...inventory[0], date: "2026-11-02", soldUnits: 0, minStay: 3 }];
    expect(quoteStay(room, plan, stay(), indexCalendar(minStay, [], []), DEFAULT_GST_SLABS)).toEqual({
      ok: false,
      reason: "min_stay",
    });
    expect(quoteStay(room, { ...plan, maxStay: 1 }, stay(), empty, DEFAULT_GST_SLABS)).toEqual({
      ok: false,
      reason: "max_stay",
    });
  });

  it("needs enough units for every room requested", () => {
    const inventory: InventoryDay[] = [
      { roomId: room.id, date: "2026-11-02", units: null, soldUnits: 4, isClosed: false, minStay: null },
    ];
    const calendar = indexCalendar(inventory, [], []);
    expect(quoteStay(room, plan, stay({ rooms: 2, adults: 2 }), calendar, DEFAULT_GST_SLABS)).toEqual({
      ok: false,
      reason: "sold_out",
    });
    const one = quoteStay(room, plan, stay(), calendar, DEFAULT_GST_SLABS);
    expect(one.ok && one.unitsLeft).toBe(1);
  });
});

describe("bestOffer", () => {
  const suite: RoomType = { ...room, id: "suite", totalUnits: 1 };
  const plans: RatePlan[] = [
    plan,
    { ...plan, id: "deluxe-cp", mealPlan: "breakfast", basePricePaise: 240_000 },
    { ...plan, id: "suite-ep", roomId: "suite", basePricePaise: 400_000 },
  ];

  it("returns the cheapest available combination", () => {
    const offer = bestOffer([room, suite], plans, stay(), empty, DEFAULT_GST_SLABS);
    expect(offer.ok && offer.ratePlanId).toBe("deluxe-ep");
    const breakfast = bestOffer(
      [room, suite],
      plans,
      stay(),
      empty,
      DEFAULT_GST_SLABS,
      (p) => p.mealPlan !== "room_only",
    );
    expect(breakfast.ok && breakfast.ratePlanId).toBe("deluxe-cp");
  });

  it("explains why nothing is bookable", () => {
    const soldOut = indexCalendar(
      [
        { roomId: "deluxe", date: "2026-11-02", units: 0, soldUnits: 0, isClosed: false, minStay: null },
        { roomId: "suite", date: "2026-11-02", units: 0, soldUnits: 0, isClosed: false, minStay: null },
      ],
      [],
      [],
    );
    expect(bestOffer([room, suite], plans, stay(), soldOut, DEFAULT_GST_SLABS)).toEqual({
      ok: false,
      reason: "sold_out",
    });
  });

  it("gives a starting price without dates", () => {
    expect(startingPrice([room, suite], plans)).toBe(200_000);
    expect(startingPrice([{ ...room, isActive: false }], [plan])).toBeNull();
  });
});
