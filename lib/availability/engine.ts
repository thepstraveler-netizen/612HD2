import { isoWeekday, stayNights, type IsoDate } from "@/lib/dates";
import { gstForRoomNight, type GstSlab } from "@/lib/pricing/tax";

/**
 * Hotel availability and stay pricing. Pure functions over plain data so the
 * listing, the detail page and (phase 4) the server-side booking price check
 * all compute the same numbers. Money is integer paise.
 */

export type MealPlan = "room_only" | "breakfast" | "half_board" | "full_board";

export type CancellationRule = { hours_before: number; refund_percent: number };

export type RoomType = {
  id: string;
  baseOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  totalUnits: number;
  isActive: boolean;
};

export type RatePlan = {
  id: string;
  roomId: string;
  mealPlan: MealPlan;
  isRefundable: boolean;
  cancellationRules: CancellationRule[];
  basePricePaise: number;
  extraAdultPaise: number;
  extraChildPaise: number;
  minStay: number;
  maxStay: number | null;
  isActive: boolean;
};

export type InventoryDay = {
  roomId: string;
  date: IsoDate;
  units: number | null;
  soldUnits: number;
  isClosed: boolean;
  minStay: number | null;
};

export type RateOverride = { ratePlanId: string; date: IsoDate; pricePaise: number };

export type PricingRule = {
  id: string;
  roomId: string | null;
  ratePlanId: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  /** ISO weekdays 1–7; empty = every day. */
  weekdays: number[];
  adjustment: "percent" | "flat" | "fixed";
  /** percent: basis points; flat: paise delta; fixed: paise price. */
  value: number;
  priority: number;
  isActive: boolean;
};

export type StayRequest = {
  checkIn: IsoDate;
  checkOut: IsoDate;
  rooms: number;
  /** Totals across all rooms. */
  adults: number;
  children: number;
};

/** Per-date lookups built once per request with {@link indexCalendar}. */
export type CalendarIndex = {
  inventory: Map<string, InventoryDay>;
  rates: Map<string, number>;
  rules: PricingRule[];
};

export function indexCalendar(
  inventory: InventoryDay[],
  rates: RateOverride[],
  rules: PricingRule[],
): CalendarIndex {
  return {
    inventory: new Map(inventory.map((d) => [`${d.roomId}|${d.date}`, d])),
    rates: new Map(rates.map((r) => [`${r.ratePlanId}|${r.date}`, r.pricePaise])),
    rules: rules.filter((r) => r.isActive),
  };
}

// ------------------------------------------------------------------ rates

function ruleSpecificity(rule: PricingRule): number {
  if (rule.ratePlanId) return 2;
  if (rule.roomId) return 1;
  return 0;
}

function ruleApplies(rule: PricingRule, plan: RatePlan, date: IsoDate): boolean {
  if (date < rule.startDate || date > rule.endDate) return false;
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(isoWeekday(date))) return false;
  if (rule.ratePlanId) return rule.ratePlanId === plan.id;
  if (rule.roomId) return rule.roomId === plan.roomId;
  return true;
}

/**
 * The price of one room for one night on `plan`, before extra guests:
 * a per-date override wins; otherwise the best matching pricing rule
 * (highest priority, then most specific, then latest start) adjusts the
 * plan's base price.
 */
export function nightlyRate(plan: RatePlan, date: IsoDate, calendar: CalendarIndex): number {
  const override = calendar.rates.get(`${plan.id}|${date}`);
  if (override !== undefined) return override;

  let best: PricingRule | undefined;
  for (const rule of calendar.rules) {
    if (!ruleApplies(rule, plan, date)) continue;
    if (
      !best ||
      rule.priority > best.priority ||
      (rule.priority === best.priority &&
        (ruleSpecificity(rule) > ruleSpecificity(best) ||
          (ruleSpecificity(rule) === ruleSpecificity(best) && rule.startDate > best.startDate)))
    ) {
      best = rule;
    }
  }

  const base = plan.basePricePaise;
  if (!best) return base;
  switch (best.adjustment) {
    case "percent":
      return Math.max(0, base + Math.round((base * best.value) / 10_000));
    case "flat":
      return Math.max(0, base + best.value);
    case "fixed":
      return Math.max(0, best.value);
  }
}

// ------------------------------------------------------------------ occupancy

export type RoomOccupancy = { adults: number; children: number };

/**
 * Spreads the party over the rooms as evenly as possible (adults first),
 * or returns null when the party cannot fit this room type.
 */
export function distributeGuests(room: RoomType, request: StayRequest): RoomOccupancy[] | null {
  const { rooms, adults, children } = request;
  if (rooms < 1 || adults < rooms) return null; // every room needs an adult
  const split = (total: number) =>
    Array.from({ length: rooms }, (_, i) => Math.floor(total / rooms) + (i < total % rooms ? 1 : 0));
  const adultsPer = split(adults);
  const childrenPer = split(children).reverse(); // put children with the rooms that have fewer adults
  const occupancy = adultsPer.map((a, i) => ({ adults: a, children: childrenPer[i] }));
  const fits = occupancy.every(
    (o) =>
      o.adults <= room.maxAdults &&
      o.children <= room.maxChildren &&
      o.adults + o.children <= room.maxOccupancy,
  );
  return fits ? occupancy : null;
}

// ------------------------------------------------------------------ quote

export type Unavailable =
  "invalid_dates" | "inactive" | "occupancy" | "min_stay" | "max_stay" | "closed" | "sold_out";

export type NightPrice = { date: IsoDate; roomRatePaise: number; availableUnits: number };

export type StayQuote = {
  ok: true;
  roomId: string;
  ratePlanId: string;
  nights: NightPrice[];
  /** Room rate × rooms × nights. */
  roomChargesPaise: number;
  /** Extra adults and children across all rooms and nights. */
  extraGuestPaise: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  /** Average price per room per night before tax (for "₹X / night" labels). */
  avgNightlyPaise: number;
  /** Fewest units left on any night of the stay. */
  unitsLeft: number;
  freeCancellation: boolean;
};

export type QuoteResult = StayQuote | { ok: false; reason: Unavailable };

/** Units still sellable for a room on a date. */
export function availableUnits(room: RoomType, date: IsoDate, calendar: CalendarIndex): number {
  const day = calendar.inventory.get(`${room.id}|${date}`);
  if (day?.isClosed) return 0;
  const units = day?.units ?? room.totalUnits;
  return Math.max(0, units - (day?.soldUnits ?? 0));
}

export function offersFreeCancellation(plan: RatePlan): boolean {
  return plan.isRefundable && plan.cancellationRules.some((r) => r.refund_percent >= 100);
}

export function quoteStay(
  room: RoomType,
  plan: RatePlan,
  request: StayRequest,
  calendar: CalendarIndex,
  gstSlabs: readonly GstSlab[],
): QuoteResult {
  const dates = stayNights(request.checkIn, request.checkOut);
  if (dates.length === 0) return { ok: false, reason: "invalid_dates" };
  if (!room.isActive || !plan.isActive || plan.roomId !== room.id) return { ok: false, reason: "inactive" };

  const occupancy = distributeGuests(room, request);
  if (!occupancy) return { ok: false, reason: "occupancy" };

  const arrival = calendar.inventory.get(`${room.id}|${request.checkIn}`);
  const minStay = Math.max(plan.minStay, arrival?.minStay ?? 1);
  if (dates.length < minStay) return { ok: false, reason: "min_stay" };
  if (plan.maxStay !== null && dates.length > plan.maxStay) return { ok: false, reason: "max_stay" };

  const nights: NightPrice[] = [];
  let roomCharges = 0;
  let extras = 0;
  let tax = 0;
  for (const date of dates) {
    const day = calendar.inventory.get(`${room.id}|${date}`);
    if (day?.isClosed) return { ok: false, reason: "closed" };
    const left = availableUnits(room, date, calendar);
    if (left < request.rooms) return { ok: false, reason: "sold_out" };

    const rate = nightlyRate(plan, date, calendar);
    nights.push({ date, roomRatePaise: rate, availableUnits: left });
    for (const o of occupancy) {
      const extra =
        Math.max(0, o.adults - room.baseOccupancy) * plan.extraAdultPaise + o.children * plan.extraChildPaise;
      roomCharges += rate;
      extras += extra;
      // GST slab is decided by what this room costs for this night.
      tax += gstForRoomNight(gstSlabs, rate + extra);
    }
  }

  const subtotal = roomCharges + extras;
  return {
    ok: true,
    roomId: room.id,
    ratePlanId: plan.id,
    nights,
    roomChargesPaise: roomCharges,
    extraGuestPaise: extras,
    subtotalPaise: subtotal,
    taxPaise: tax,
    totalPaise: subtotal + tax,
    avgNightlyPaise: Math.round(roomCharges / (dates.length * request.rooms)),
    unitsLeft: Math.min(...nights.map((n) => n.availableUnits)),
    freeCancellation: offersFreeCancellation(plan),
  };
}

/** Cheapest bookable room + plan for the request, or the most informative reason none fits. */
export function bestOffer(
  rooms: RoomType[],
  plans: RatePlan[],
  request: StayRequest,
  calendar: CalendarIndex,
  gstSlabs: readonly GstSlab[],
  filter: (plan: RatePlan) => boolean = () => true,
): QuoteResult {
  let best: StayQuote | undefined;
  let reason: Unavailable = "inactive";
  // Report the reason closest to bookable when nothing fits.
  const rank: Unavailable[] = [
    "inactive",
    "invalid_dates",
    "occupancy",
    "max_stay",
    "min_stay",
    "closed",
    "sold_out",
  ];
  for (const room of rooms) {
    for (const plan of plans) {
      if (plan.roomId !== room.id || !filter(plan)) continue;
      const quote = quoteStay(room, plan, request, calendar, gstSlabs);
      if (quote.ok) {
        if (!best || quote.totalPaise < best.totalPaise) best = quote;
      } else if (rank.indexOf(quote.reason) > rank.indexOf(reason)) {
        reason = quote.reason;
      }
    }
  }
  return best ?? { ok: false, reason };
}

/** "Starting from" price when no dates are chosen: cheapest active plan's base price. */
export function startingPrice(rooms: RoomType[], plans: RatePlan[]): number | null {
  const activeRooms = new Set(rooms.filter((r) => r.isActive && r.totalUnits > 0).map((r) => r.id));
  const prices = plans.filter((p) => p.isActive && activeRooms.has(p.roomId)).map((p) => p.basePricePaise);
  return prices.length ? Math.min(...prices) : null;
}
