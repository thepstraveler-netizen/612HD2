import { describe, expect, it } from "vitest";
import {
  cancellationRules,
  hotelRow,
  percentToBps,
  pricingRuleAmountInput,
  pricingRuleRow,
  pricingRuleValue,
  ratePlanRow,
} from "@/lib/hotels/admin-rows";
import { expandEditDates, planCalendarEdit, type ExistingInventory } from "@/lib/hotels/calendar-edit";
import { csvCell, hotelsToCsv, toCsv, type HotelExportRow } from "@/lib/hotels/csv";
import {
  calendarEditSchema,
  hotelFormSchema,
  pricingRuleFormSchema,
  ratePlanFormSchema,
  type CalendarEditInput,
} from "@/schemas/hotels";

const HOTEL = "11111111-1111-4111-8111-111111111111";
const ROOM = "22222222-2222-4222-8222-222222222222";
const PLAN = "33333333-3333-4333-8333-333333333333";
const CITY = "44444444-4444-4444-8444-444444444444";

function edit(overrides: Partial<CalendarEditInput> = {}) {
  return calendarEditSchema.parse({
    hotel_id: HOTEL,
    room_id: ROOM,
    // 2026-10-05 is a Monday.
    start: "2026-10-05",
    end: "2026-10-11",
    weekdays: [],
    availability: "keep",
    units: "",
    min_stay: "",
    rate_plan_id: "",
    price: "",
    clear_price: false,
    ...overrides,
  });
}

describe("calendar edit: dates", () => {
  it("expands the inclusive range", () => {
    expect(expandEditDates("2026-10-30", "2026-11-02", [])).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("keeps only the chosen ISO weekdays", () => {
    // Weekends of the week of Mon 5 Oct 2026.
    expect(expandEditDates("2026-10-05", "2026-10-11", [6, 7])).toEqual(["2026-10-10", "2026-10-11"]);
    expect(expandEditDates("2026-10-05", "2026-10-18", [1])).toEqual(["2026-10-05", "2026-10-12"]);
  });

  it("accepts weekday strings from the form", () => {
    expect(edit({ weekdays: ["5"] as unknown as number[] }).weekdays).toEqual([5]);
  });
});

describe("calendar edit: inventory merge", () => {
  const existing: ExistingInventory[] = [
    { date: "2026-10-05", units: 3, is_closed: true, min_stay: 2 },
    { date: "2026-10-06", units: null, is_closed: false, min_stay: null },
  ];

  it("skips inventory when nothing inventory-related changes", () => {
    const plan = planCalendarEdit(edit(), existing);
    expect(plan.dates).toHaveLength(7);
    expect(plan.inventory).toEqual([]);
    expect(plan.rates).toEqual([]);
    expect(plan.clearRates).toBeNull();
  });

  it("close / open set is_closed and keep other existing values", () => {
    const closed = planCalendarEdit(edit({ availability: "close", end: "2026-10-07" }), existing);
    expect(closed.inventory).toEqual([
      { room_id: ROOM, date: "2026-10-05", units: 3, is_closed: true, min_stay: 2 },
      { room_id: ROOM, date: "2026-10-06", units: null, is_closed: true, min_stay: null },
      { room_id: ROOM, date: "2026-10-07", units: null, is_closed: true, min_stay: null },
    ]);
    const opened = planCalendarEdit(edit({ availability: "open", end: "2026-10-05" }), existing);
    expect(opened.inventory).toEqual([
      { room_id: ROOM, date: "2026-10-05", units: 3, is_closed: false, min_stay: 2 },
    ]);
  });

  it("keep leaves is_closed untouched while changing units / min stay", () => {
    const plan = planCalendarEdit(edit({ units: "5", end: "2026-10-07" }), existing);
    expect(plan.inventory.map((r) => [r.date, r.units, r.is_closed, r.min_stay])).toEqual([
      ["2026-10-05", 5, true, 2],
      ["2026-10-06", 5, false, null],
      ["2026-10-07", 5, false, null],
    ]);
    const stay = planCalendarEdit(edit({ min_stay: "3", end: "2026-10-05" }), existing);
    expect(stay.inventory).toEqual([
      { room_id: ROOM, date: "2026-10-05", units: 3, is_closed: true, min_stay: 3 },
    ]);
  });

  it("zero units is a change, not 'leave untouched'", () => {
    const plan = planCalendarEdit(edit({ units: "0", end: "2026-10-05" }), existing);
    expect(plan.inventory[0].units).toBe(0);
  });

  it("never sends sold_units", () => {
    const plan = planCalendarEdit(edit({ availability: "close", units: 4, min_stay: 2 }), existing);
    for (const row of plan.inventory) expect(row).not.toHaveProperty("sold_units");
  });

  it("only touches the filtered weekdays", () => {
    const plan = planCalendarEdit(edit({ availability: "close", weekdays: [6, 7] }), existing);
    expect(plan.inventory.map((r) => r.date)).toEqual(["2026-10-10", "2026-10-11"]);
  });
});

describe("calendar edit: rates", () => {
  it("upserts a price in paise for every date of the plan", () => {
    const plan = planCalendarEdit(edit({ rate_plan_id: PLAN, price: "2,499.50", end: "2026-10-06" }), []);
    expect(plan.rates).toEqual([
      { rate_plan_id: PLAN, date: "2026-10-05", price_paise: 249950 },
      { rate_plan_id: PLAN, date: "2026-10-06", price_paise: 249950 },
    ]);
    expect(plan.clearRates).toBeNull();
    expect(plan.inventory).toEqual([]);
  });

  it("clear removes overrides instead of setting a price", () => {
    const plan = planCalendarEdit(
      edit({ rate_plan_id: PLAN, clear_price: true, price: "", weekdays: [6, 7] }),
      [],
    );
    expect(plan.rates).toEqual([]);
    expect(plan.clearRates).toEqual({ rate_plan_id: PLAN, dates: ["2026-10-10", "2026-10-11"] });
  });

  it("clear wins over a typed price", () => {
    const plan = planCalendarEdit(edit({ rate_plan_id: PLAN, clear_price: true, price: "100" }), []);
    expect(plan.rates).toEqual([]);
    expect(plan.clearRates?.dates).toHaveLength(7);
  });

  it("a price needs a plan (schema)", () => {
    expect(calendarEditSchema.safeParse({ ...edit(), price: "100", rate_plan_id: "" }).success).toBe(false);
  });

  it("a zero price is an override, not empty", () => {
    const plan = planCalendarEdit(edit({ rate_plan_id: PLAN, price: "0", end: "2026-10-05" }), []);
    expect(plan.rates).toEqual([{ rate_plan_id: PLAN, date: "2026-10-05", price_paise: 0 }]);
  });
});

describe("csv", () => {
  it("quotes per RFC 4180", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("yes");
    expect(csvCell(-5)).toBe("-5");
  });

  it("neutralises formula injection", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+91 98765")).toBe("'+91 98765");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
  });

  it("joins rows with CRLF and a trailing newline", () => {
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
  });

  it("exports one row per plan with rupee amounts", () => {
    const row: HotelExportRow = {
      hotelSlug: "radha-kunj",
      hotelName: "Radha Kunj, Vrindavan",
      status: "published",
      citySlug: "vrindavan",
      propertyType: "guest_house",
      stars: 3,
      roomName: "Deluxe",
      units: 4,
      planName: "=cmd",
      mealPlan: "breakfast",
      basePricePaise: 249950,
      extraAdultPaise: 50000,
      extraChildPaise: 0,
      refundable: false,
    };
    const lines = hotelsToCsv([row]).split("\r\n");
    expect(lines[0]).toBe(
      "hotel_slug,hotel_name,status,city,property_type,stars,room,units,rate_plan,meal_plan,base_price_inr,extra_adult_inr,extra_child_inr,refundable",
    );
    expect(lines[1]).toBe(
      `radha-kunj,"Radha Kunj, Vrindavan",published,vrindavan,guest_house,3,Deluxe,4,'=cmd,breakfast,2499.50,500,0,no`,
    );
  });
});

describe("form → row mapping", () => {
  it("percent → basis points", () => {
    expect(percentToBps(25)).toBe(2500);
    expect(percentToBps(-10)).toBe(-1000);
    expect(percentToBps(12.5)).toBe(1250);
    expect(percentToBps(0.29)).toBe(29);
  });

  it("pricing rule values: percent in bps, flat/fixed in paise", () => {
    expect(pricingRuleValue("percent", 25)).toBe(2500);
    expect(pricingRuleValue("percent", -10)).toBe(-1000);
    expect(pricingRuleValue("flat", -300)).toBe(-30000);
    expect(pricingRuleValue("fixed", 1499.5)).toBe(149950);
    expect(pricingRuleAmountInput(2500)).toBe("25");
    expect(pricingRuleAmountInput(-1000)).toBe("-10");
    expect(pricingRuleAmountInput(149950)).toBe("1499.50");
  });

  it("maps a parsed pricing rule form", () => {
    const form = pricingRuleFormSchema.parse({
      hotel_id: HOTEL,
      room_id: "",
      rate_plan_id: PLAN,
      name: "Holi",
      start_date: "2027-03-20",
      end_date: "2027-03-23",
      weekdays: ["7", "6", "6"],
      adjustment: "percent",
      amount: "25",
      priority: "10",
      is_active: true,
    });
    expect(pricingRuleRow(form)).toMatchObject({
      room_id: null,
      rate_plan_id: PLAN,
      weekdays: [6, 7],
      value: 2500,
      priority: 10,
    });
    expect(pricingRuleFormSchema.safeParse({ ...form, adjustment: "fixed", amount: "-5" }).success).toBe(
      false,
    );
  });

  it("maps rate plans: paise and free-cancellation rules", () => {
    const plan = ratePlanFormSchema.parse({
      name: { en: "Breakfast", hi: "" },
      meal_plan: "breakfast",
      inclusions: [],
      is_refundable: true,
      free_cancel_hours: "48",
      base_price: "1,999",
      extra_adult: "500.5",
      extra_child: "",
      min_stay: "1",
      max_stay: "",
      is_active: true,
    });
    expect(ratePlanRow(plan, ROOM, 2)).toMatchObject({
      room_id: ROOM,
      base_price_paise: 199900,
      extra_adult_paise: 50050,
      extra_child_paise: 0,
      max_stay: null,
      sort_order: 2,
      cancellation_rules: [{ hours_before: 48, refund_percent: 100 }],
    });
    expect(cancellationRules({ is_refundable: false, free_cancel_hours: 48 })).toEqual([]);
    expect(cancellationRules({ is_refundable: true, free_cancel_hours: null })).toEqual([]);
  });

  it("maps the hotel form: paise, bps, seo and empty description", () => {
    const form = hotelFormSchema.parse({
      slug: "radha-kunj",
      name: { en: "Radha Kunj", hi: "राधा कुंज" },
      summary: { en: "", hi: "" },
      description: { en: "", hi: "" },
      property_type: "guest_house",
      star_rating: "3",
      city_id: CITY,
      area_id: "",
      vendor_id: "",
      address: "",
      lat: "27.58",
      lng: "",
      check_in_time: "12:00",
      check_out_time: "11:00",
      highlights: [],
      food_dining: { en: "", hi: "" },
      policies: {},
      amenity_ids: [],
      is_couple_friendly: true,
      is_featured: false,
      is_sponsored: false,
      pay_at_hotel_enabled: true,
      part_payment_percent: "25",
      early_checkin: "499",
      late_checkout: "",
      breakfast_addon: "150.50",
      commission_percent: "12.5",
      rating_avg: "4.25",
      rating_count: "10",
      status: "draft",
      seo_title: "Stay near Banke Bihari",
      seo_description: "",
      sort_order: "100",
    });
    expect(hotelRow(form)).toMatchObject({
      description: { en: "" },
      summary: null,
      area_id: null,
      vendor_id: null,
      address: null,
      lat: 27.58,
      lng: null,
      early_checkin_paise: 49900,
      late_checkout_paise: null,
      breakfast_addon_paise: 15050,
      commission_bps: 1250,
      part_payment_percent: 25,
      rating_avg: 4.3,
      seo: { title: "Stay near Banke Bihari", description: "" },
    });
    expect(hotelRow({ ...form, commission_percent: null }).commission_bps).toBeNull();
  });
});
