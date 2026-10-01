import { describe, expect, it } from "vitest";
import {
  EXPIRY_WARNING_DAYS,
  driverExpiryAlerts,
  expiryAlerts,
  fleetExpiryAlerts,
  vehicleExpiryAlerts,
  worstExpiry,
} from "@/lib/cabs/expiry";

const TODAY = "2026-10-01";

const vehicle = (overrides: Partial<Parameters<typeof vehicleExpiryAlerts>[0]> = {}) => ({
  rc_expiry: null,
  insurance_expiry: null,
  permit_expiry: null,
  puc_expiry: null,
  fitness_expiry: null,
  ...overrides,
});

describe("expiryAlerts", () => {
  it("ignores missing, malformed and far-off dates", () => {
    expect(
      expiryAlerts({ licence: null, rc: undefined, insurance: "not-a-date", permit: "2027-01-01" }, TODAY),
    ).toEqual([]);
  });

  it("flags a paper expiring within the window, counting the expiry day as still valid", () => {
    expect(expiryAlerts({ puc: "2026-10-01" }, TODAY)).toEqual([
      { paper: "puc", date: "2026-10-01", daysLeft: 0, state: "expiring" },
    ]);
    expect(expiryAlerts({ puc: "2026-10-31" }, TODAY)[0]).toMatchObject({ daysLeft: 30, state: "expiring" });
  });

  it("stops flagging one day past the window", () => {
    expect(EXPIRY_WARNING_DAYS).toBe(30);
    expect(expiryAlerts({ puc: "2026-11-01" }, TODAY)).toEqual([]);
  });

  it("marks papers before today as expired", () => {
    expect(expiryAlerts({ insurance: "2026-09-30" }, TODAY)).toEqual([
      { paper: "insurance", date: "2026-09-30", daysLeft: -1, state: "expired" },
    ]);
  });

  it("accepts a custom window", () => {
    expect(expiryAlerts({ rc: "2026-10-10" }, TODAY, 7)).toEqual([]);
    expect(expiryAlerts({ rc: "2026-10-08" }, TODAY, 7)).toHaveLength(1);
  });

  it("puts the most urgent first", () => {
    const alerts = expiryAlerts({ rc: "2026-10-20", insurance: "2026-08-01", puc: "2026-10-02" }, TODAY);
    expect(alerts.map((a) => a.paper)).toEqual(["insurance", "puc", "rc"]);
  });

  it("works across a year boundary", () => {
    expect(expiryAlerts({ permit: "2027-01-05" }, "2026-12-20")[0]).toMatchObject({ daysLeft: 16 });
  });
});

describe("driver and vehicle alerts", () => {
  it("checks the driving licence for drivers", () => {
    expect(driverExpiryAlerts({ licence_expiry: "2026-10-15" }, TODAY)).toEqual([
      { paper: "licence", date: "2026-10-15", daysLeft: 14, state: "expiring" },
    ]);
    expect(driverExpiryAlerts({ licence_expiry: null }, TODAY)).toEqual([]);
  });

  it("checks RC, insurance, permit, PUC and fitness for vehicles", () => {
    const alerts = vehicleExpiryAlerts(
      vehicle({
        rc_expiry: "2026-09-01",
        insurance_expiry: "2026-10-05",
        permit_expiry: "2026-10-06",
        puc_expiry: "2026-10-07",
        fitness_expiry: "2026-10-08",
      }),
      TODAY,
    );
    expect(alerts.map((a) => [a.paper, a.state])).toEqual([
      ["rc", "expired"],
      ["insurance", "expiring"],
      ["permit", "expiring"],
      ["puc", "expiring"],
      ["fitness", "expiring"],
    ]);
  });

  it("summarises the worst state", () => {
    expect(worstExpiry([])).toBeNull();
    expect(worstExpiry(expiryAlerts({ puc: "2026-10-10" }, TODAY))).toBe("expiring");
    expect(worstExpiry(expiryAlerts({ puc: "2026-10-10", rc: "2026-01-01" }, TODAY))).toBe("expired");
  });
});

describe("fleetExpiryAlerts", () => {
  it("merges drivers and vehicles, labelled and sorted by urgency", () => {
    const alerts = fleetExpiryAlerts(
      [
        { id: "d1", full_name: "Ramesh", licence_expiry: "2026-10-20" },
        { id: "d2", full_name: "Suresh", licence_expiry: "2028-01-01" },
      ],
      [{ id: "v1", registration_no: "UP85 AB 1234", ...vehicle({ insurance_expiry: "2026-09-25" }) }],
      TODAY,
    );
    expect(alerts.map((a) => [a.owner, a.ownerId, a.label, a.paper, a.daysLeft])).toEqual([
      ["vehicle", "v1", "UP85 AB 1234", "insurance", -6],
      ["driver", "d1", "Ramesh", "licence", 19],
    ]);
  });
});
