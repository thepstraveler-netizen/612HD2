import { describe, expect, it } from "vitest";
import {
  boardStatuses,
  canAssignRide,
  driverRideUrl,
  newRideVehicleValues,
  nextRideSteps,
  nightBpsToPercentInput,
  nightPercentToBps,
  parseRideBoardFilters,
  rideBoardGroup,
  rideDayBounds,
  rideErrorKey,
  rideFareGridValues,
  rideFareOffered,
  rideFareRuleRow,
  ridePayment,
  rideSettingsFormValues,
  rideSettingsValue,
  rideVehicleChoices,
  rideVehicleFormValues,
  rideVehicleRow,
  vehicleTypeFormValues,
  vehicleTypeRow,
  whatsappShareUrl,
  zoneFormValues,
  zoneRow,
} from "@/lib/rides/admin-rows";
import {
  assignRideSchema,
  pointFormSchema,
  rideFaresFormSchema,
  rideSettingsFormSchema,
  rideVehicleFormSchema,
  vehicleTypeFormSchema,
  zoneFormSchema,
} from "@/schemas/ride-admin";
import { rideSettingsSchema } from "@/schemas/rides";
import type { Tables } from "@/types/database";

const ZONE = "11111111-1111-4111-8111-111111111111";
const BIKE = "22222222-2222-4222-8222-222222222222";
const CAR = "33333333-3333-4333-8333-333333333333";
const RIDE = "44444444-4444-4444-8444-444444444444";
const DRIVER = "55555555-5555-4555-8555-555555555555";

const stamps = { created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };

function rule(over: Partial<Tables<"ride_fare_rules">>): Tables<"ride_fare_rules"> {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    zone_id: ZONE,
    vehicle_type_id: BIKE,
    mode: "point_to_point",
    base_paise: 3000,
    included_km: 2,
    per_km_paise: 1250,
    min_fare_paise: 4000,
    hourly_rate_paise: 0,
    min_hours: 1,
    km_per_hour: 10,
    free_waiting_minutes: 5,
    per_min_waiting_paise: 200,
    night_bps: 12500,
    is_active: true,
    ...stamps,
    ...over,
  };
}

describe("night surcharge", () => {
  it("converts % to basis points over 10000 and back", () => {
    expect(nightPercentToBps(0)).toBe(10_000);
    expect(nightPercentToBps(25)).toBe(12_500);
    expect(nightPercentToBps(12.5)).toBe(11_250);
    expect(nightPercentToBps(100)).toBe(20_000);
    expect(nightBpsToPercentInput(12_500)).toBe("25");
    expect(nightBpsToPercentInput(11_250)).toBe("12.5");
    expect(nightBpsToPercentInput(10_000)).toBe("0");
  });
});

describe("vehicle types", () => {
  it("stores GST % as basis points and reads it back", () => {
    const form = vehicleTypeFormSchema.parse({
      key: "e-rickshaw",
      service_slug: "rickshaw",
      name: { en: "E-rickshaw", hi: "ई-रिक्शा" },
      description: { en: "", hi: "" },
      icon: "bike",
      seats: "4",
      instant_book: true,
      gst_percent: "5",
      is_active: true,
      sort_order: 20,
    });
    const row = vehicleTypeRow(form);
    expect(row.tax_bps).toBe(500);
    expect(row.seats).toBe(4);
    expect(row.description).toBeNull();
    const back = vehicleTypeFormValues({ ...row, id: BIKE, ...stamps } as Tables<"ride_vehicle_types">);
    expect(back.gst_percent).toBe("5");
    expect(back.description).toEqual({ en: "", hi: "" });
  });

  it("rejects GST over 28% and too many seats", () => {
    const base = {
      key: "car",
      service_slug: "car",
      name: { en: "Car", hi: "कार" },
      description: { en: "", hi: "" },
      icon: "car",
      instant_book: true,
      is_active: true,
      sort_order: 0,
    };
    expect(vehicleTypeFormSchema.safeParse({ ...base, seats: 4, gst_percent: "30" }).success).toBe(false);
    expect(vehicleTypeFormSchema.safeParse({ ...base, seats: 13, gst_percent: "5" }).success).toBe(false);
  });
});

describe("zones and landmarks", () => {
  it("parses coordinates and rounds the radius to one decimal", () => {
    const form = zoneFormSchema.parse({
      slug: "vrindavan",
      name: { en: "Vrindavan", hi: "वृंदावन" },
      lat: "27.58",
      lng: "77.70",
      radius_km: "6.25",
      is_active: true,
      sort_order: 1,
    });
    const row = zoneRow(form);
    expect(row).toMatchObject({ lat: 27.58, lng: 77.7, radius_km: 6.3 });
    expect(zoneFormValues({ ...row, id: ZONE, ...stamps } as Tables<"ride_zones">).radius_km).toBe("6.3");
  });

  it("rejects a bad coordinate and an unknown landmark kind", () => {
    const point = {
      zone_id: ZONE,
      slug: "prem-mandir",
      name: { en: "Prem Mandir", hi: "प्रेम मंदिर" },
      kind: "temple",
      lat: "27.57",
      lng: "77.67",
      is_popular: true,
      is_active: true,
      sort_order: 1,
    };
    expect(pointFormSchema.safeParse(point).success).toBe(true);
    expect(pointFormSchema.safeParse({ ...point, lat: "95" }).success).toBe(false);
    expect(pointFormSchema.safeParse({ ...point, kind: "mall" }).success).toBe(false);
  });
});

describe("fare grid", () => {
  const types = [{ id: BIKE }, { id: CAR }];

  it("lists every type × mode and fills stored rules in rupees", () => {
    const values = rideFareGridValues(ZONE, types, [
      rule({}),
      rule({
        vehicle_type_id: CAR,
        mode: "hourly",
        base_paise: 0,
        min_fare_paise: 0,
        hourly_rate_paise: 30000,
        per_km_paise: 1500,
        min_hours: 2,
      }),
    ]);
    expect(values.rules).toHaveLength(4);
    const bike = values.rules.find((r) => r.vehicle_type_id === BIKE && r.mode === "point_to_point");
    expect(bike).toMatchObject({
      base: "30",
      per_km: "12.50",
      min_fare: "40",
      included_km: "2",
      per_min_waiting: "2",
      night_percent: "25",
    });
    const carHourly = values.rules.find((r) => r.vehicle_type_id === CAR && r.mode === "hourly");
    expect(carHourly).toMatchObject({ hourly: "300", per_km: "15", base: "", min_fare: "", min_hours: 2 });
    const empty = values.rules.find((r) => r.vehicle_type_id === CAR && r.mode === "point_to_point");
    expect(empty).toMatchObject({ base: "", per_km: "", min_fare: "", night_percent: "0" });
  });

  it("round-trips a grid through the schema into paise rows", () => {
    const values = rideFareGridValues(ZONE, types, [rule({})]);
    const parsed = rideFaresFormSchema.parse(values);
    const offered = parsed.rules.filter(rideFareOffered);
    expect(offered).toHaveLength(1);
    expect(rideFareRuleRow(ZONE, offered[0]!)).toMatchObject({
      zone_id: ZONE,
      vehicle_type_id: BIKE,
      mode: "point_to_point",
      base_paise: 3000,
      per_km_paise: 1250,
      min_fare_paise: 4000,
      hourly_rate_paise: 0,
      per_min_waiting_paise: 200,
      night_bps: 12500,
    });
  });

  it("treats a cell without its main amount as not offered", () => {
    const cell = {
      vehicle_type_id: BIKE,
      included_km: "0",
      per_min_waiting: "",
      min_hours: 1,
      km_per_hour: 10,
      free_waiting_minutes: 5,
      night_percent: "0",
      is_active: true,
    };
    const parsed = rideFaresFormSchema.parse({
      zone_id: ZONE,
      rules: [
        { ...cell, mode: "point_to_point", base: "", per_km: "", min_fare: "", hourly: "" },
        { ...cell, mode: "hourly", base: "", per_km: "10", min_fare: "", hourly: "" },
      ],
    });
    expect(parsed.rules.map(rideFareOffered)).toEqual([false, false]);
  });

  it("rejects an all-zero point-to-point fare, a zero hourly rate and night over +100%", () => {
    const cell = {
      vehicle_type_id: BIKE,
      included_km: "0",
      per_min_waiting: "0",
      min_hours: 1,
      km_per_hour: 10,
      free_waiting_minutes: 5,
      night_percent: "0",
      is_active: true,
      hourly: "",
    };
    const zero = rideFaresFormSchema.safeParse({
      zone_id: ZONE,
      rules: [{ ...cell, mode: "point_to_point", base: "0", per_km: "0", min_fare: "" }],
    });
    expect(zero.success).toBe(false);
    const hourly = rideFaresFormSchema.safeParse({
      zone_id: ZONE,
      rules: [{ ...cell, mode: "hourly", base: "", per_km: "", min_fare: "", hourly: "0" }],
    });
    expect(hourly.success).toBe(false);
    const night = rideFaresFormSchema.safeParse({
      zone_id: ZONE,
      rules: [
        { ...cell, mode: "point_to_point", base: "30", per_km: "", min_fare: "", night_percent: "150" },
      ],
    });
    expect(night.success).toBe(false);
    const bad = rideFaresFormSchema.safeParse({
      zone_id: ZONE,
      rules: [{ ...cell, mode: "point_to_point", base: "12.345", per_km: "", min_fare: "" }],
    });
    expect(bad.success).toBe(false);
  });
});

describe("ride vehicles", () => {
  it("allows an empty registration and stores it as null", () => {
    const form = rideVehicleFormSchema.parse(newRideVehicleValues(BIKE));
    const row = rideVehicleRow(form);
    expect(row).toMatchObject({
      category_id: null,
      ride_vehicle_type_id: BIKE,
      registration_no: null,
      fuel: "electric",
    });
  });

  it("normalises a registration and reads the row back", () => {
    const form = rideVehicleFormSchema.parse({
      ...newRideVehicleValues(BIKE),
      registration_no: " up85  ab 1234 ",
    });
    const row = rideVehicleRow(form);
    expect(row.registration_no).toBe("UP85 AB 1234");
    const back = rideVehicleFormValues({
      ...(row as Tables<"vehicles">),
      id: CAR,
      ride_vehicle_type_id: BIKE,
      year: null,
      vendor_id: null,
      deleted_at: null,
      ...stamps,
    });
    expect(back.registration_no).toBe("UP85 AB 1234");
    expect(back.default_driver_id).toBe("");
  });
});

describe("dispatch", () => {
  it("groups statuses for the board", () => {
    expect(rideBoardGroup("requested")).toBe("requested");
    expect(rideBoardGroup("picked_up")).toBe("active");
    expect(rideBoardGroup("no_show")).toBe("finished");
    expect(rideBoardGroup("awaiting_payment")).toBeNull();
    expect(boardStatuses(undefined)).toBeNull();
    expect(boardStatuses("active")).toEqual(["assigned", "en_route", "arrived", "picked_up"]);
    expect(boardStatuses("cancelled")).toEqual(["cancelled"]);
  });

  it("mirrors set_ride_status transitions and assign_ride states", () => {
    expect(nextRideSteps("requested")).toEqual([]);
    expect(nextRideSteps("assigned")).toEqual(["en_route", "arrived", "picked_up"]);
    expect(nextRideSteps("arrived")).toEqual(["picked_up", "no_show"]);
    expect(nextRideSteps("picked_up")).toEqual(["completed"]);
    expect(canAssignRide("requested")).toBe(true);
    expect(canAssignRide("en_route")).toBe(true);
    expect(canAssignRide("arrived")).toBe(false);
  });

  it("lists the booked vehicle type first", () => {
    const choices = rideVehicleChoices(BIKE, [
      { id: "a", typeId: CAR, label: "Car · A", defaultDriverId: null },
      { id: "b", typeId: BIKE, label: "Bike · B", defaultDriverId: DRIVER },
    ]);
    expect(choices.map((c) => [c.id, c.otherType])).toEqual([
      ["b", false],
      ["a", true],
    ]);
  });

  it("accepts an assignment without a vehicle", () => {
    expect(assignRideSchema.parse({ rideId: RIDE, driverId: DRIVER, vehicleId: "" }).vehicleId).toBeNull();
    expect(assignRideSchema.parse({ rideId: RIDE, driverId: DRIVER }).vehicleId).toBeNull();
    expect(assignRideSchema.safeParse({ rideId: RIDE, driverId: "x" }).success).toBe(false);
  });

  it("maps database errors and builds driver and WhatsApp links", () => {
    expect(rideErrorKey("driver_unavailable")).toBe("driverUnavailable");
    expect(rideErrorKey("something else")).toBe("actionFailed");
    expect(driverRideUrl("https://example.in/", "ab12")).toBe("https://example.in/driver/ride/ab12");
    expect(whatsappShareUrl("98765 43210", "Hi & bye")).toBe(
      "https://wa.me/919876543210?text=Hi%20%26%20bye",
    );
    expect(whatsappShareUrl("+91 98765 43210", "x")).toBe("https://wa.me/919876543210?text=x");
    expect(whatsappShareUrl(null, "x")).toBe("https://wa.me/?text=x");
  });

  it("works out what the driver collects", () => {
    expect(ridePayment({ payment_mode: "pay_at_hotel", total_paise: 18000, paid_paise: 0 })).toEqual({
      kind: "driver",
      duePaise: 18000,
    });
    expect(ridePayment({ payment_mode: "full", total_paise: 18000, paid_paise: 18000 })).toEqual({
      kind: "online",
      paid: true,
      duePaise: 0,
    });
  });
});

describe("board filters", () => {
  it("keeps valid filters and drops bad ones", () => {
    expect(parseRideBoardFilters({ status: "active", date: "2026-10-02" })).toEqual({
      status: "active",
      date: "2026-10-02",
    });
    expect(parseRideBoardFilters({ status: "bogus", date: "02/10/2026" })).toEqual({});
    expect(parseRideBoardFilters({ status: ["requested", "x"] })).toEqual({ status: "requested" });
  });

  it("turns an India date into a UTC range", () => {
    expect(rideDayBounds("2026-10-02")).toEqual({
      start: "2026-10-01T18:30:00.000Z",
      end: "2026-10-02T18:30:00.000Z",
    });
  });
});

describe("settings", () => {
  it("round-trips rides.defaults through the form", () => {
    const defaults = rideSettingsSchema.parse({});
    const form = rideSettingsFormSchema.parse(rideSettingsFormValues(defaults));
    const value = rideSettingsValue(form);
    expect(rideSettingsSchema.parse(value)).toEqual(defaults);
  });

  it("sorts cancellation rules by notice and validates ranges", () => {
    const input = {
      ...rideSettingsFormValues(rideSettingsSchema.parse({})),
      cancellation_rules: [
        { hours_before: "0", refund_percent: 50 },
        { hours_before: "2", refund_percent: 100 },
      ],
    };
    const value = rideSettingsValue(rideSettingsFormSchema.parse(input));
    expect(value.cancellation_rules.map((r) => r.hours_before)).toEqual([2, 0]);
    expect(rideSettingsFormSchema.safeParse({ ...input, road_factor: "5" }).success).toBe(false);
    expect(rideSettingsFormSchema.safeParse({ ...input, night_start: "25:00" }).success).toBe(false);
  });
});
