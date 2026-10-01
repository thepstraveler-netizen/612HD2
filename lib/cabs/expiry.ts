import { daysBetween, isIsoDate, type IsoDate } from "@/lib/dates";

/**
 * Which fleet papers are expired or about to expire. A paper is valid up
 * to and including its expiry date (India calendar); it is flagged from
 * {@link EXPIRY_WARNING_DAYS} days before. Pure, so the dispatch board and
 * the driver / vehicle lists agree and the rule is unit-tested.
 */

export const EXPIRY_WARNING_DAYS = 30;

export const DRIVER_PAPERS = ["licence"] as const;
export const VEHICLE_PAPERS = ["rc", "insurance", "permit", "puc", "fitness"] as const;
export type FleetPaper = (typeof DRIVER_PAPERS)[number] | (typeof VEHICLE_PAPERS)[number];

export type ExpiryState = "expired" | "expiring";

export type ExpiryAlert = {
  paper: FleetPaper;
  date: IsoDate;
  /** Days from today to the expiry date; negative once expired, 0 = last valid day. */
  daysLeft: number;
  state: ExpiryState;
};

/** Alerts for one driver or vehicle, most urgent first. Missing or malformed dates are ignored. */
export function expiryAlerts(
  dates: Partial<Record<FleetPaper, string | null | undefined>>,
  today: IsoDate,
  windowDays: number = EXPIRY_WARNING_DAYS,
): ExpiryAlert[] {
  const alerts: ExpiryAlert[] = [];
  for (const [paper, date] of Object.entries(dates) as [FleetPaper, string | null | undefined][]) {
    if (!date || !isIsoDate(date)) continue;
    const daysLeft = daysBetween(today, date);
    if (daysLeft > windowDays) continue;
    alerts.push({ paper, date, daysLeft, state: daysLeft < 0 ? "expired" : "expiring" });
  }
  return alerts.sort((a, b) => a.daysLeft - b.daysLeft || a.paper.localeCompare(b.paper));
}

export function driverExpiryAlerts(
  driver: { licence_expiry: string | null },
  today: IsoDate,
  windowDays?: number,
): ExpiryAlert[] {
  return expiryAlerts({ licence: driver.licence_expiry }, today, windowDays);
}

export function vehicleExpiryAlerts(
  vehicle: {
    rc_expiry: string | null;
    insurance_expiry: string | null;
    permit_expiry: string | null;
    puc_expiry: string | null;
    fitness_expiry: string | null;
  },
  today: IsoDate,
  windowDays?: number,
): ExpiryAlert[] {
  return expiryAlerts(
    {
      rc: vehicle.rc_expiry,
      insurance: vehicle.insurance_expiry,
      permit: vehicle.permit_expiry,
      puc: vehicle.puc_expiry,
      fitness: vehicle.fitness_expiry,
    },
    today,
    windowDays,
  );
}

export type FleetExpiryAlert = ExpiryAlert & {
  owner: "driver" | "vehicle";
  ownerId: string;
  /** Driver name or registration number. */
  label: string;
};

/** Every alert across the fleet, most urgent first (the dispatch board banner). */
export function fleetExpiryAlerts(
  drivers: readonly { id: string; full_name: string; licence_expiry: string | null }[],
  vehicles: readonly (Parameters<typeof vehicleExpiryAlerts>[0] & { id: string; registration_no: string })[],
  today: IsoDate,
  windowDays?: number,
): FleetExpiryAlert[] {
  return [
    ...drivers.flatMap((d) =>
      driverExpiryAlerts(d, today, windowDays).map((a) => ({
        ...a,
        owner: "driver" as const,
        ownerId: d.id,
        label: d.full_name,
      })),
    ),
    ...vehicles.flatMap((v) =>
      vehicleExpiryAlerts(v, today, windowDays).map((a) => ({
        ...a,
        owner: "vehicle" as const,
        ownerId: v.id,
        label: v.registration_no,
      })),
    ),
  ].sort((a, b) => a.daysLeft - b.daysLeft || a.label.localeCompare(b.label));
}

/** The worst state among alerts (for a row badge), or null when all papers are fine. */
export function worstExpiry(alerts: readonly ExpiryAlert[]): ExpiryState | null {
  if (alerts.some((a) => a.state === "expired")) return "expired";
  return alerts.length ? "expiring" : null;
}
