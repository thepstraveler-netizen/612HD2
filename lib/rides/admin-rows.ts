import type { Tone } from "@/components/admin/booking-status";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import { indiaDayBounds } from "@/lib/cabs/admin-rows";
import type { IsoDate } from "@/lib/dates";
import { percentToBps } from "@/lib/hotels/admin-rows";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { paiseToRupeesInput } from "@/lib/money";
import {
  rideBoardFiltersSchema,
  type PointForm,
  type PointFormInput,
  type RideBoardFilters,
  type RideBoardGroup,
  type RideFareCell,
  type RideFaresFormInput,
  type RideSettingsForm,
  type RideSettingsFormInput,
  type RideStatus,
  type RideStep,
  type RideVehicleForm,
  type RideVehicleFormInput,
  type VehicleTypeForm,
  type VehicleTypeFormInput,
  type ZoneForm,
  type ZoneFormInput,
} from "@/schemas/ride-admin";
import type { RideMode, RideSettings } from "@/schemas/rides";
import type { Tables, TablesInsert } from "@/types/database";

/**
 * Pure helpers behind the rides admin: validated form values ↔ table rows
 * (rupees ↔ paise, % ↔ basis points), the ride state machine as staff see
 * it, the live board grouping and filters, payment text inputs and RPC
 * error codes. Unit-tested; the server code only reads and writes.
 */

const emptyLocalized = { en: "", hi: "" };

function localizedInput(value: LocalizedJson | null | undefined) {
  return value ? { en: value.en, hi: value.hi ?? "" } : emptyLocalized;
}

/** No night surcharge. */
export const NIGHT_BPS_NONE = 10_000;

/** Night surcharge typed as "+25" (%) → night_bps 12500. */
export function nightPercentToBps(percent: number): number {
  return NIGHT_BPS_NONE + percentToBps(percent);
}

/** night_bps 12500 → "25" (%). */
export function nightBpsToPercentInput(bps: number): string {
  return bpsToPercentInput(Math.max(0, bps - NIGHT_BPS_NONE));
}

// ---------------------------------------------------------------- vehicle types

export function vehicleTypeRow(form: VehicleTypeForm): TablesInsert<"ride_vehicle_types"> {
  return {
    key: form.key,
    service_slug: form.service_slug,
    name: form.name,
    // Nullable column; the generated insert type is stricter.
    description: form.description as LocalizedJson | null,
    icon: form.icon,
    seats: form.seats,
    instant_book: form.instant_book,
    tax_bps: percentToBps(form.gst_percent),
    is_active: form.is_active,
    sort_order: form.sort_order,
  };
}

export function newVehicleTypeValues(serviceSlug: string): VehicleTypeFormInput {
  return {
    key: "",
    service_slug: serviceSlug,
    name: emptyLocalized,
    description: emptyLocalized,
    icon: "bike",
    seats: 1,
    instant_book: true,
    gst_percent: "0",
    is_active: true,
    sort_order: 100,
  };
}

export function vehicleTypeFormValues(v: Tables<"ride_vehicle_types">): VehicleTypeFormInput {
  return {
    id: v.id,
    key: v.key,
    service_slug: v.service_slug,
    name: localizedInput(v.name),
    description: localizedInput(v.description),
    icon: v.icon,
    seats: v.seats,
    instant_book: v.instant_book,
    gst_percent: bpsToPercentInput(v.tax_bps),
    is_active: v.is_active,
    sort_order: v.sort_order,
  };
}

// ---------------------------------------------------------------- zones and landmarks

export function zoneRow(form: ZoneForm): TablesInsert<"ride_zones"> {
  return {
    slug: form.slug,
    name: form.name,
    lat: form.lat,
    lng: form.lng,
    radius_km: form.radius_km,
    is_active: form.is_active,
    sort_order: form.sort_order,
  };
}

export const NEW_ZONE: ZoneFormInput = {
  slug: "",
  name: emptyLocalized,
  lat: "",
  lng: "",
  radius_km: "5",
  is_active: true,
  sort_order: 100,
};

export function zoneFormValues(z: Tables<"ride_zones">): ZoneFormInput {
  return {
    id: z.id,
    slug: z.slug,
    name: localizedInput(z.name),
    lat: String(z.lat),
    lng: String(z.lng),
    radius_km: String(Number(z.radius_km)),
    is_active: z.is_active,
    sort_order: z.sort_order,
  };
}

export function pointRow(form: PointForm): TablesInsert<"ride_points"> {
  return {
    zone_id: form.zone_id,
    slug: form.slug,
    name: form.name,
    kind: form.kind,
    lat: form.lat,
    lng: form.lng,
    is_popular: form.is_popular,
    is_active: form.is_active,
    sort_order: form.sort_order,
  };
}

export function newPointValues(zoneId: string): PointFormInput {
  return {
    zone_id: zoneId,
    slug: "",
    name: emptyLocalized,
    kind: "temple",
    lat: "",
    lng: "",
    is_popular: false,
    is_active: true,
    sort_order: 100,
  };
}

export function pointFormValues(p: Tables<"ride_points">): PointFormInput {
  return {
    id: p.id,
    zone_id: p.zone_id,
    slug: p.slug,
    name: localizedInput(p.name),
    kind: p.kind,
    lat: String(p.lat),
    lng: String(p.lng),
    is_popular: p.is_popular,
    is_active: p.is_active,
    sort_order: p.sort_order,
  };
}

// ---------------------------------------------------------------- fare grid

export const RIDE_GRID_MODES: readonly RideMode[] = ["point_to_point", "hourly"];

/** A cell is offered once its main amount is filled; empty cells are removed on save. */
export function rideFareOffered(
  cell: Pick<RideFareCell, "mode" | "base" | "per_km" | "min_fare" | "hourly">,
) {
  return cell.mode === "hourly"
    ? cell.hourly !== null
    : cell.base !== null || cell.per_km !== null || cell.min_fare !== null;
}

/** A validated, offered cell → its fare rule row (amounts the other mode ignores are kept). */
export function rideFareRuleRow(zoneId: string, cell: RideFareCell): TablesInsert<"ride_fare_rules"> {
  return {
    zone_id: zoneId,
    vehicle_type_id: cell.vehicle_type_id,
    mode: cell.mode,
    base_paise: cell.base ?? 0,
    included_km: cell.included_km,
    per_km_paise: cell.per_km ?? 0,
    min_fare_paise: cell.min_fare ?? 0,
    hourly_rate_paise: cell.hourly ?? 0,
    min_hours: cell.min_hours,
    km_per_hour: cell.km_per_hour,
    free_waiting_minutes: cell.free_waiting_minutes,
    per_min_waiting_paise: cell.per_min_waiting,
    night_bps: nightPercentToBps(cell.night_percent),
    is_active: cell.is_active,
  };
}

/** Stored paise → form text; a zero the mode does not use shows as empty. */
const moneyInput = (paise: number | undefined, keepZero: boolean) =>
  paise === undefined || (paise === 0 && !keepZero) ? "" : paiseToRupeesInput(paise);

/** One zone's grid: every vehicle type × mode, filled from stored rules or blank. */
export function rideFareGridValues(
  zoneId: string,
  types: readonly Pick<Tables<"ride_vehicle_types">, "id">[],
  rules: readonly Tables<"ride_fare_rules">[],
): RideFaresFormInput {
  return {
    zone_id: zoneId,
    rules: RIDE_GRID_MODES.flatMap((mode) =>
      types.map((t) => {
        const r = rules.find((x) => x.zone_id === zoneId && x.vehicle_type_id === t.id && x.mode === mode);
        const p2p = mode === "point_to_point";
        return {
          vehicle_type_id: t.id,
          mode,
          // A stored point-to-point rule shows all three amounts so it stays "offered".
          base: r && p2p ? paiseToRupeesInput(r.base_paise) : "",
          included_km: r ? String(Number(r.included_km)) : "0",
          per_km: r ? moneyInput(r.per_km_paise, p2p) : "",
          min_fare: r && p2p ? paiseToRupeesInput(r.min_fare_paise) : "",
          hourly: r && !p2p ? paiseToRupeesInput(r.hourly_rate_paise) : "",
          min_hours: r?.min_hours ?? 1,
          km_per_hour: r?.km_per_hour ?? 10,
          free_waiting_minutes: r?.free_waiting_minutes ?? 5,
          per_min_waiting: r ? moneyInput(r.per_min_waiting_paise, false) : "",
          night_percent: r ? nightBpsToPercentInput(r.night_bps) : "0",
          is_active: r?.is_active ?? true,
        };
      }),
    ),
  };
}

// ---------------------------------------------------------------- ride vehicles

/** A ride vehicle: has a ride vehicle type (cab vehicles are listed under Cabs). */
export type RideVehicle = Tables<"vehicles"> & { ride_vehicle_type_id: string };

export const isRideVehicle = <V extends { ride_vehicle_type_id: string | null }>(
  v: V,
): v is V & { ride_vehicle_type_id: string } => v.ride_vehicle_type_id !== null;

export function rideVehicleRow(form: RideVehicleForm): TablesInsert<"vehicles"> {
  return {
    category_id: null,
    model_id: null,
    ride_vehicle_type_id: form.ride_vehicle_type_id,
    registration_no: form.registration_no,
    colour: form.colour,
    fuel: form.fuel,
    default_driver_id: form.default_driver_id,
    rc_expiry: form.rc_expiry,
    insurance_expiry: form.insurance_expiry,
    permit_expiry: form.permit_expiry,
    puc_expiry: form.puc_expiry,
    fitness_expiry: form.fitness_expiry,
    is_active: form.is_active,
    notes: form.notes,
  };
}

export function newRideVehicleValues(typeId: string): RideVehicleFormInput {
  return {
    ride_vehicle_type_id: typeId,
    registration_no: "",
    colour: "",
    fuel: "electric",
    default_driver_id: "",
    rc_expiry: "",
    insurance_expiry: "",
    permit_expiry: "",
    puc_expiry: "",
    fitness_expiry: "",
    is_active: true,
    notes: "",
  };
}

export function rideVehicleFormValues(v: RideVehicle): RideVehicleFormInput {
  return {
    id: v.id,
    ride_vehicle_type_id: v.ride_vehicle_type_id,
    registration_no: v.registration_no ?? "",
    colour: v.colour ?? "",
    fuel: v.fuel,
    default_driver_id: v.default_driver_id ?? "",
    rc_expiry: v.rc_expiry ?? "",
    insurance_expiry: v.insurance_expiry ?? "",
    permit_expiry: v.permit_expiry ?? "",
    puc_expiry: v.puc_expiry ?? "",
    fitness_expiry: v.fitness_expiry ?? "",
    is_active: v.is_active,
    notes: v.notes ?? "",
  };
}

// ---------------------------------------------------------------- dispatch

export const RIDE_ACTIVE_STATUSES: readonly RideStatus[] = ["assigned", "en_route", "arrived", "picked_up"];
export const RIDE_FINISHED_STATUSES: readonly RideStatus[] = ["completed", "cancelled", "no_show"];

/** Board sections, in order; awaiting_payment rides are not on the board. */
export function rideBoardGroup(status: RideStatus): RideBoardGroup | null {
  if (status === "requested") return "requested";
  if (RIDE_ACTIVE_STATUSES.includes(status)) return "active";
  if (RIDE_FINISHED_STATUSES.includes(status)) return "finished";
  return null;
}

/** Statuses a board filter selects (a group or one status); undefined = the default board. */
export function boardStatuses(filter: RideBoardFilters["status"]): readonly RideStatus[] | null {
  if (!filter) return null;
  if (filter === "requested") return ["requested"];
  if (filter === "active") return RIDE_ACTIVE_STATUSES;
  if (filter === "finished") return RIDE_FINISHED_STATUSES;
  return [filter];
}

/** Next steps staff may take; mirrors the transitions in set_ride_status(). */
export function nextRideSteps(status: RideStatus): RideStep[] {
  switch (status) {
    case "assigned":
      return ["en_route", "arrived", "picked_up"];
    case "en_route":
      return ["arrived", "picked_up"];
    case "arrived":
      return ["picked_up", "no_show"];
    case "picked_up":
      return ["completed"];
    default:
      return [];
  }
}

/** assign_ride() accepts these: a driver can be swapped until the pickup. */
export function canAssignRide(status: RideStatus): boolean {
  return status === "requested" || status === "assigned" || status === "en_route";
}

export function rideTone(status: RideStatus): Tone {
  switch (status) {
    case "requested":
      return "warning";
    case "assigned":
    case "en_route":
    case "arrived":
    case "picked_up":
      return "info";
    case "completed":
      return "success";
    case "cancelled":
    case "no_show":
      return "danger";
    default:
      return "muted";
  }
}

export type RideVehicleChoice = {
  id: string;
  label: string;
  typeId: string;
  defaultDriverId: string | null;
  /** Not the booked vehicle type. */
  otherType: boolean;
};

/** Ride vehicles for an assignment: the booked type first, then the other types. */
export function rideVehicleChoices(
  bookedTypeId: string,
  vehicles: readonly { id: string; typeId: string; label: string; defaultDriverId: string | null }[],
): RideVehicleChoice[] {
  return vehicles
    .map((v) => ({ ...v, otherType: v.typeId !== bookedTypeId }))
    .sort((a, b) => Number(a.otherType) - Number(b.otherType) || a.label.localeCompare(b.label));
}

/** Database errors raised by assign_ride / set_ride_status → keys under admin.rides.errors. */
export function rideErrorKey(message: string): string {
  const codes = {
    driver_unavailable: "driverUnavailable",
    vehicle_unavailable: "vehicleUnavailable",
    driver_busy: "driverBusy",
    vehicle_busy: "vehicleBusy",
    invalid_transition: "invalidTransition",
    otp_mismatch: "otpMismatch",
    not_found: "notFound",
  } as const;
  for (const [code, value] of Object.entries(codes)) {
    if (message.includes(code)) return value;
  }
  return "actionFailed";
}

/** Driver ride page for a token; the site URL's trailing slash is ignored. */
export function driverRideUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, "")}/driver/ride/${token}`;
}

/** wa.me link with a message, to the driver's number when known (10-digit numbers get +91). */
export function whatsappShareUrl(phone: string | null, message: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}

export type RidePayment =
  { kind: "driver"; duePaise: number } | { kind: "online"; paid: boolean; duePaise: number };

/** How a ride is paid: to the driver (with what they collect) or online. */
export function ridePayment(b: {
  payment_mode: string;
  total_paise: number;
  paid_paise: number;
}): RidePayment {
  const duePaise = Math.max(0, b.total_paise - b.paid_paise);
  return b.payment_mode === "pay_at_hotel"
    ? { kind: "driver", duePaise }
    : { kind: "online", paid: duePaise === 0, duePaise };
}

// ---------------------------------------------------------------- board filters

/** Reads Next's `searchParams` into board filters. */
export function parseRideBoardFilters(raw: Record<string, string | string[] | undefined>): RideBoardFilters {
  const flat: Record<string, string> = {};
  for (const [k, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") flat[k] = v;
  }
  return rideBoardFiltersSchema.parse(flat);
}

/** India pickup date → [start, end) instants. */
export function rideDayBounds(date: IsoDate) {
  const { start, end } = indiaDayBounds(date, date);
  return { start: start as string, end: end as string };
}

// ---------------------------------------------------------------- settings

/** Settings form → stored `rides.defaults` value. */
export function rideSettingsValue(form: RideSettingsForm): RideSettings {
  return {
    road_factor: form.road_factor,
    avg_speed_kmph: form.avg_speed_kmph,
    max_ride_km: form.max_ride_km,
    min_lead_minutes: form.min_lead_minutes,
    max_advance_days: form.max_advance_days,
    max_hours: form.max_hours,
    night_start: form.night_start,
    night_end: form.night_end,
    require_pickup_otp: form.require_pickup_otp,
    pay_later_enabled: form.pay_later_enabled,
    hold_minutes: form.hold_minutes,
    sac: form.sac,
    // Longest notice first, the order the refund policy reads them in.
    cancellation_rules: [...form.cancellation_rules].sort((a, b) => b.hours_before - a.hours_before),
  };
}

export function rideSettingsFormValues(s: RideSettings): RideSettingsFormInput {
  return {
    road_factor: String(s.road_factor),
    avg_speed_kmph: String(s.avg_speed_kmph),
    max_ride_km: String(s.max_ride_km),
    min_lead_minutes: s.min_lead_minutes,
    max_advance_days: s.max_advance_days,
    max_hours: s.max_hours,
    night_start: s.night_start,
    night_end: s.night_end,
    require_pickup_otp: s.require_pickup_otp,
    pay_later_enabled: s.pay_later_enabled,
    hold_minutes: s.hold_minutes,
    sac: s.sac,
    cancellation_rules: s.cancellation_rules.map((r) => ({
      hours_before: String(r.hours_before),
      refund_percent: r.refund_percent,
    })),
  };
}
