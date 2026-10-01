import { describe, expect, it } from "vitest";
import {
  addonRow,
  cabSettingsFormValues,
  cabSettingsValue,
  canAssign,
  dispatchGroup,
  driverRow,
  driverTripUrl,
  fareGridValues,
  fareRuleRow,
  indiaDayBounds,
  multiplierLabel,
  nextTripSteps,
  paperColumn,
  parseTripFilters,
  routeRow,
  stopsInput,
  surchargeFormValues,
  surchargeRow,
  tripErrorKey,
  tripFiltersQuery,
  vehicleChoices,
} from "@/lib/cabs/admin-rows";
import {
  addonFormSchema,
  cabSettingsFormSchema,
  categoryFormSchema,
  driverFormSchema,
  fareRulesFormSchema,
  fleetDocumentSchema,
  packageFormSchema,
  placeFormSchema,
  routeFormSchema,
  surchargeFormSchema,
  vehicleFormSchema,
} from "@/schemas/cab-admin";
import { cabSettingsSchema } from "@/schemas/cabs";
import type { Tables } from "@/types/database";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

describe("catalog schemas", () => {
  it("parses a place with coordinates typed as text", () => {
    const place = placeFormSchema.parse({
      slug: "mathura-junction",
      name: { en: "Mathura Junction", hi: "" },
      kind: "station",
      lat: "27.4799",
      lng: " 77.6791 ",
      is_popular: true,
      is_active: true,
      sort_order: "3",
    });
    expect(place).toMatchObject({ lat: 27.4799, lng: 77.6791, sort_order: 3, name: { hi: null } });
    expect(placeFormSchema.safeParse({ ...place, lat: "95" }).error?.issues[0]?.message).toBe(
      "invalidCoordinate",
    );
  });

  it("rejects duplicate model names in a category", () => {
    const base = {
      key: "sedan",
      name: { en: "Sedan" },
      description: null,
      body_type: "sedan",
      seats: "4",
      luggage: "2",
      is_ac: true,
      image_id: "",
      is_active: true,
      sort_order: 2,
    };
    const model = { name: "Swift Dzire", fuel: "cng", is_featured: true, is_active: true };
    expect(categoryFormSchema.safeParse({ ...base, models: [model] }).data?.image_id).toBeNull();
    const dup = categoryFormSchema.safeParse({ ...base, models: [model, { ...model, name: "swift dzire" }] });
    expect(dup.error?.issues[0]).toMatchObject({ message: "duplicateModel", path: ["_form"] });
  });

  it("stores a route's stops as names and rounds the distance", () => {
    const route = routeFormSchema.parse({
      slug: "braj-darshan",
      trip_type: "sightseeing",
      from_place_id: A,
      to_place_id: A,
      name: { en: "Braj darshan", hi: "ब्रज दर्शन" },
      description: { en: "" },
      stops: [{ name: "Gokul" }, { name: " Govardhan " }],
      distance_km: "120.26",
      duration_minutes: "480",
      is_popular: true,
      is_active: true,
      sort_order: 1,
    });
    const row = routeRow(route);
    expect(row).toMatchObject({ stops: ["Gokul", "Govardhan"], distance_km: 120.3, description: null });
    expect(stopsInput(row.stops ?? [])).toEqual([{ name: "Gokul" }, { name: "Govardhan" }]);
    expect(stopsInput({ not: "an array" })).toEqual([]);
  });

  it("allows the same start and end only for sightseeing tours", () => {
    const input = {
      slug: "x",
      trip_type: "transfer",
      from_place_id: A,
      to_place_id: A,
      name: null,
      description: null,
      stops: [],
      distance_km: "10",
      duration_minutes: 30,
      is_popular: false,
      is_active: true,
      sort_order: 0,
    };
    expect(routeFormSchema.safeParse(input).error?.issues[0]?.message).toBe("samePlace");
    expect(routeFormSchema.safeParse({ ...input, to_place_id: B }).success).toBe(true);
    expect(routeFormSchema.safeParse({ ...input, trip_type: "local" }).success).toBe(false);
  });

  it("converts add-on rupees to paise and de-duplicates the scope", () => {
    const addon = addonFormSchema.parse({
      key: "carrier",
      name: { en: "Roof carrier" },
      description: null,
      price: "₹1,499.50",
      trip_types: ["round_trip", "one_way", "one_way"],
      category_ids: [B, A],
      is_active: true,
      sort_order: 1,
    });
    expect(addonRow(addon)).toMatchObject({
      price_paise: 149_950,
      trip_types: ["one_way", "round_trip"],
      category_ids: [A, B],
    });
    expect(addonFormSchema.safeParse({ ...addon, price: "" }).error?.issues[0]?.message).toBe("required");
  });

  it("treats an empty package fare as not offered", () => {
    const pkg = packageFormSchema.parse({
      key: "8hr-80km",
      name: { en: "8 hrs · 80 km" },
      hours: "8",
      km: "80",
      is_active: true,
      sort_order: 2,
      fares: [
        { category_id: A, fare: "2200", extra_km: "14", extra_hour: "" },
        { category_id: B, fare: "", extra_km: "", extra_hour: "" },
      ],
    });
    expect(pkg.fares).toEqual([
      { category_id: A, fare: 220_000, extra_km: 1400, extra_hour: 0 },
      { category_id: B, fare: null, extra_km: 0, extra_hour: 0 },
    ]);
    expect(packageFormSchema.safeParse({ ...pkg, fares: [{ ...pkg.fares[0], fare: "0" }] }).success).toBe(
      false,
    );
  });
});

describe("fare rules", () => {
  it("keeps only the minimum that belongs to the trip type", () => {
    const { rules } = fareRulesFormSchema.parse({
      rules: [
        {
          category_id: A,
          trip_type: "one_way",
          rate_per_km: "13",
          min_km: "80",
          min_km_per_day: "250",
          driver_allowance: "300",
          night_charge: "250",
          extra_km: "13",
          tolls_included: false,
          waiting_free_minutes: "45",
          waiting_per_hour: "",
          is_active: true,
        },
      ],
    });
    const rule = rules[0]!;
    expect(fareRuleRow({ ...rule, rate_per_km: rule.rate_per_km ?? 0 })).toMatchObject({
      rate_per_km_paise: 1300,
      min_km: 80,
      min_km_per_day: 0,
      driver_allowance_per_day_paise: 30_000,
      night_charge_paise: 25_000,
      waiting_per_hour_paise: 0,
    });
    expect(fareRuleRow({ ...rule, trip_type: "round_trip", rate_per_km: 1200 })).toMatchObject({
      min_km: 0,
      min_km_per_day: 250,
    });
  });

  it("fills a grid cell for every category × trip type", () => {
    const stored = {
      id: C,
      category_id: A,
      trip_type: "one_way",
      rate_per_km_paise: 1150,
      min_km: 80,
      min_km_per_day: 0,
      driver_allowance_per_day_paise: 30_000,
      night_charge_paise: 25_000,
      extra_km_paise: 1100,
      tolls_included: true,
      waiting_free_minutes: 45,
      waiting_per_hour_paise: 10_000,
      is_active: true,
      created_at: "",
      updated_at: "",
    } satisfies Tables<"cab_fare_rules">;
    const grid = fareGridValues([{ id: A }, { id: B }], [stored]);
    expect(grid.rules).toHaveLength(4);
    expect(grid.rules[0]).toMatchObject({ category_id: A, trip_type: "one_way", rate_per_km: "11.50" });
    expect(grid.rules[1]).toMatchObject({ category_id: A, trip_type: "round_trip", rate_per_km: "" });
  });
});

describe("peak pricing", () => {
  it("stores the fare level as basis points and shows it as a percentage", () => {
    const form = surchargeFormSchema.parse({
      name: { en: "Holi" },
      multiplier_percent: "125%",
      starts_on: "2027-03-20",
      ends_on: "2027-03-23",
      weekdays: ["7", 6],
      trip_types: [],
      category_ids: [],
      is_active: true,
    });
    const row = surchargeRow(form);
    expect(row).toMatchObject({ multiplier_bps: 12_500, weekdays: [6, 7] });
    expect(multiplierLabel(12_500)).toBe("125%");
    expect(multiplierLabel(11_250)).toBe("112.5%");
    expect(surchargeFormValues({ ...(row as Tables<"cab_surcharges">), id: A }).multiplier_percent).toBe(
      "125",
    );
  });

  it("rejects a level below 100% or above 300% and a reversed window", () => {
    const base = {
      name: { en: "Peak" },
      starts_on: "",
      ends_on: "",
      weekdays: [],
      trip_types: [],
      category_ids: [],
      is_active: true,
    };
    expect(surchargeFormSchema.safeParse({ ...base, multiplier_percent: "90" }).success).toBe(false);
    expect(surchargeFormSchema.safeParse({ ...base, multiplier_percent: "301" }).success).toBe(false);
    expect(surchargeFormSchema.parse({ ...base, multiplier_percent: "300" }).starts_on).toBeNull();
    const reversed = surchargeFormSchema.safeParse({
      ...base,
      multiplier_percent: "150",
      starts_on: "2027-03-23",
      ends_on: "2027-03-20",
    });
    expect(reversed.error?.issues[0]).toMatchObject({ message: "endBeforeStart", path: ["ends_on"] });
  });
});

describe("fleet schemas", () => {
  it("normalises a driver's phone, languages and licence", () => {
    const form = driverFormSchema.parse({
      full_name: "Ramesh Kumar",
      phone: "+91 98765-43210",
      alt_phone: "",
      licence_no: "up85 2020 0001",
      licence_expiry: "2027-05-01",
      languages: "Hindi, English, , Hindi",
      rating: "4.66",
      is_active: true,
      notes: "",
      login_email: " Driver@Example.com ",
    });
    expect(form).toMatchObject({
      phone: "+919876543210",
      alt_phone: null,
      languages: ["Hindi", "English"],
      login_email: "driver@example.com",
      notes: null,
    });
    expect(driverRow(form, B)).toMatchObject({ licence_no: "UP85 2020 0001", rating: 4.7, user_id: B });
    expect(
      driverFormSchema.safeParse({ ...form, languages: "", phone: "12345" }).error?.issues[0]?.message,
    ).toBe("invalidPhone");
  });

  it("upper-cases a registration number and checks its format", () => {
    const base = {
      category_id: A,
      model_id: "",
      colour: "",
      year: "",
      fuel: "cng",
      default_driver_id: "",
      rc_expiry: "",
      insurance_expiry: "2027-01-31",
      permit_expiry: "",
      puc_expiry: "",
      fitness_expiry: "",
      is_active: true,
      notes: "",
    };
    expect(vehicleFormSchema.parse({ ...base, registration_no: " up85  ab 1234 " })).toMatchObject({
      registration_no: "UP85 AB 1234",
      model_id: null,
      year: null,
      insurance_expiry: "2027-01-31",
      rc_expiry: null,
    });
    expect(vehicleFormSchema.safeParse({ ...base, registration_no: "UP/85" }).success).toBe(false);
    expect(
      vehicleFormSchema.safeParse({ ...base, registration_no: "UP85AB1234", year: "1980" }).success,
    ).toBe(false);
  });

  it("only records document paths under the owner's folder", () => {
    const doc = {
      owner_type: "vehicle",
      owner_id: A,
      kind: "insurance",
      file_path: `fleet/vehicle/${A}/${B}.pdf`,
      expires_on: "",
    };
    expect(fleetDocumentSchema.parse(doc).expires_on).toBeNull();
    expect(fleetDocumentSchema.safeParse({ ...doc, file_path: `${A}/x.pdf` }).success).toBe(false);
    expect(fleetDocumentSchema.safeParse({ ...doc, file_path: `fleet/vehicle/${A}/../x.pdf` }).success).toBe(
      false,
    );
    expect(paperColumn("vehicle", "insurance")).toBe("insurance_expiry");
    expect(paperColumn("driver", "licence")).toBe("licence_expiry");
    expect(paperColumn("driver", "rc")).toBeNull();
    expect(paperColumn("vehicle", "other")).toBeNull();
  });
});

describe("dispatch", () => {
  it("offers the same next steps as set_trip_status()", () => {
    expect(nextTripSteps("unassigned")).toEqual([]);
    expect(nextTripSteps("assigned")).toEqual(["en_route", "arrived", "picked_up"]);
    expect(nextTripSteps("en_route")).toEqual(["arrived", "picked_up"]);
    expect(nextTripSteps("arrived")).toEqual(["picked_up", "no_show"]);
    expect(nextTripSteps("picked_up")).toEqual(["completed"]);
    expect(nextTripSteps("completed")).toEqual([]);
    expect(nextTripSteps("cancelled")).toEqual([]);
  });

  it("groups trips on the board and allows reassignment until pickup", () => {
    expect(dispatchGroup("unassigned")).toBe("unassigned");
    expect(dispatchGroup("assigned")).toBe("assigned");
    expect(["en_route", "arrived", "picked_up"].map((s) => dispatchGroup(s as "arrived"))).toEqual([
      "inProgress",
      "inProgress",
      "inProgress",
    ]);
    expect(dispatchGroup("completed")).toBeNull();
    expect(canAssign("en_route")).toBe(true);
    expect(canAssign("arrived")).toBe(false);
  });

  it("lists the booked category first, then bigger ones as upgrades, never smaller ones", () => {
    const categories = [
      { id: A, sort_order: 1 }, // hatchback
      { id: B, sort_order: 2 }, // sedan (booked)
      { id: C, sort_order: 3 }, // SUV
    ];
    const v = (id: string, category_id: string, label: string) => ({
      id,
      category_id,
      label,
      registration_no: label,
      default_driver_id: null,
    });
    const choices = vehicleChoices(B, categories, [
      v("1", C, "SUV-1"),
      v("2", A, "HATCH-1"),
      v("3", B, "SEDAN-2"),
      v("4", B, "SEDAN-1"),
      v("5", D, "UNKNOWN"),
    ]);
    expect(choices.map((c) => [c.label, c.upgrade])).toEqual([
      ["SEDAN-1", false],
      ["SEDAN-2", false],
      ["SUV-1", true],
    ]);
  });

  it("maps database errors to messages and builds the driver link", () => {
    expect(tripErrorKey("P0001: driver_unavailable")).toBe("driverUnavailable");
    expect(tripErrorKey("vehicle_unavailable")).toBe("vehicleUnavailable");
    expect(tripErrorKey("invalid_transition")).toBe("invalidTransition");
    expect(tripErrorKey("otp_mismatch")).toBe("otpMismatch");
    expect(tripErrorKey("not_found")).toBe("notFound");
    expect(tripErrorKey("connection reset")).toBe("actionFailed");
    expect(driverTripUrl("https://ps.example/", "ab12")).toBe("https://ps.example/driver/trip/ab12");
  });
});

describe("trips list filters", () => {
  it("drops bad values, swaps a reversed range and builds the query", () => {
    const f = parseTripFilters({ status: "nope", from: "2026-10-10", to: ["2026-10-01"], page: "2" });
    expect(f).toEqual({ status: undefined, from: "2026-10-01", to: "2026-10-10", page: 2 });
    expect(tripFiltersQuery({ ...f, status: "completed" }, 3)).toBe(
      "?status=completed&from=2026-10-01&to=2026-10-10&page=3",
    );
    expect(tripFiltersQuery({})).toBe("");
  });

  it("reads pickup dates as whole India days", () => {
    expect(indiaDayBounds("2026-10-01", "2026-10-01")).toEqual({
      start: "2026-09-30T18:30:00.000Z",
      end: "2026-10-01T18:30:00.000Z",
    });
    expect(indiaDayBounds(undefined, undefined)).toEqual({ start: null, end: null });
  });
});

describe("cab settings", () => {
  it("round-trips the stored defaults through the form", () => {
    const stored = cabSettingsSchema.parse({});
    const form = cabSettingsFormSchema.parse(cabSettingsFormValues(stored));
    expect(cabSettingsSchema.parse(cabSettingsValue(form))).toEqual(stored);
  });

  it("converts rupees and GST %, and orders refund rules by notice", () => {
    const form = cabSettingsFormSchema.parse({
      ...cabSettingsFormValues(cabSettingsSchema.parse({})),
      min_advance: "750",
      gst_percent: "12",
      cancellation_rules: [
        { hours_before: "0", refund_percent: "0" },
        { hours_before: "48", refund_percent: "100" },
      ],
    });
    const value = cabSettingsValue(form);
    expect(value).toMatchObject({ min_advance_paise: 75_000, tax_bps: 1200 });
    expect(value.cancellation_rules.map((r) => r.hours_before)).toEqual([48, 0]);
    expect(
      cabSettingsFormSchema.safeParse({
        ...cabSettingsFormValues(cabSettingsSchema.parse({})),
        gst_percent: "30",
      }).success,
    ).toBe(false);
  });
});
