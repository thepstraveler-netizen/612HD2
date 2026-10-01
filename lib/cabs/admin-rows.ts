import { addDays, type IsoDate } from "@/lib/dates";
import { percentToBps } from "@/lib/hotels/admin-rows";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { paiseToRupeesInput } from "@/lib/money";
import type { Tone } from "@/components/admin/booking-status";
import type { CabSettings } from "@/schemas/cabs";
import {
  tripFiltersSchema,
  type AddonForm,
  type AddonFormInput,
  type CabSettingsForm,
  type CabSettingsFormInput,
  type CategoryForm,
  type CategoryFormInput,
  type DriverForm,
  type DriverFormInput,
  type FareRuleForm,
  type FareRulesFormInput,
  type PackageFormInput,
  type PlaceForm,
  type PlaceFormInput,
  type RouteForm,
  type RouteFormInput,
  type SurchargeForm,
  type SurchargeFormInput,
  type TripFilters,
  type TripStatus,
  type TripStep,
  type VehicleForm,
  type VehicleFormInput,
} from "@/schemas/cab-admin";
import type { Json, Tables, TablesInsert } from "@/types/database";

/**
 * Pure helpers behind the cabs admin: validated form values ↔ table rows
 * (rupees ↔ paise, % ↔ basis points), the dispatch state machine as staff
 * see it, vehicle choices for an assignment, trip list filters and RPC
 * error codes. Unit-tested; the server code only reads and writes.
 */

const emptyLocalized = { en: "", hi: "" };

function localizedInput(value: LocalizedJson | null | undefined) {
  return value ? { en: value.en, hi: value.hi ?? "" } : emptyLocalized;
}

function sortedUnique<T extends string | number>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// ---------------------------------------------------------------- places

export function placeRow(form: PlaceForm): TablesInsert<"cab_places"> {
  return {
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

export const NEW_PLACE: PlaceFormInput = {
  slug: "",
  name: emptyLocalized,
  kind: "city",
  lat: "",
  lng: "",
  is_popular: false,
  is_active: true,
  sort_order: 100,
};

export function placeFormValues(p: Tables<"cab_places">): PlaceFormInput {
  return {
    id: p.id,
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

// ---------------------------------------------------------------- categories

export function categoryRow(form: CategoryForm): TablesInsert<"cab_categories"> {
  return {
    key: form.key,
    name: form.name,
    description: form.description,
    body_type: form.body_type,
    seats: form.seats,
    luggage: form.luggage,
    is_ac: form.is_ac,
    image_id: form.image_id,
    is_active: form.is_active,
    sort_order: form.sort_order,
  };
}

export function modelRow(
  model: CategoryForm["models"][number],
  categoryId: string,
  sortOrder: number,
): TablesInsert<"cab_models"> {
  return {
    category_id: categoryId,
    name: model.name,
    fuel: model.fuel,
    is_featured: model.is_featured,
    is_active: model.is_active,
    sort_order: sortOrder,
  };
}

export const NEW_CATEGORY: CategoryFormInput = {
  key: "",
  name: emptyLocalized,
  description: emptyLocalized,
  body_type: "sedan",
  seats: 4,
  luggage: 2,
  is_ac: true,
  image_id: "",
  is_active: true,
  sort_order: 100,
  models: [],
};

export function categoryFormValues(
  c: Tables<"cab_categories">,
  models: readonly Tables<"cab_models">[],
): CategoryFormInput {
  return {
    id: c.id,
    key: c.key,
    name: localizedInput(c.name),
    description: localizedInput(c.description),
    body_type: c.body_type,
    seats: c.seats,
    luggage: c.luggage,
    is_ac: c.is_ac,
    image_id: c.image_id ?? "",
    is_active: c.is_active,
    sort_order: c.sort_order,
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      fuel: m.fuel,
      is_featured: m.is_featured,
      is_active: m.is_active,
    })),
  };
}

// ---------------------------------------------------------------- fare rules

export function fareRuleRow(rule: FareRuleForm & { rate_per_km: number }): TablesInsert<"cab_fare_rules"> {
  return {
    category_id: rule.category_id,
    trip_type: rule.trip_type,
    rate_per_km_paise: rule.rate_per_km,
    // Each trip type uses one minimum; the other is stored as 0.
    min_km: rule.trip_type === "one_way" ? rule.min_km : 0,
    min_km_per_day: rule.trip_type === "round_trip" ? rule.min_km_per_day : 0,
    driver_allowance_per_day_paise: rule.driver_allowance,
    night_charge_paise: rule.night_charge,
    extra_km_paise: rule.extra_km,
    tolls_included: rule.tolls_included,
    waiting_free_minutes: rule.waiting_free_minutes,
    waiting_per_hour_paise: rule.waiting_per_hour,
    is_active: rule.is_active,
  };
}

/** The full grid: every category × (one way, round trip), filled from stored rules or blank. */
export function fareGridValues(
  categories: readonly Pick<Tables<"cab_categories">, "id">[],
  rules: readonly Tables<"cab_fare_rules">[],
): FareRulesFormInput {
  return {
    rules: categories.flatMap((c) =>
      (["one_way", "round_trip"] as const).map((tripType) => {
        const r = rules.find((x) => x.category_id === c.id && x.trip_type === tripType);
        return {
          category_id: c.id,
          trip_type: tripType,
          rate_per_km: r ? paiseToRupeesInput(r.rate_per_km_paise) : "",
          min_km: r?.min_km ?? (tripType === "one_way" ? 80 : 0),
          min_km_per_day: r?.min_km_per_day ?? (tripType === "round_trip" ? 250 : 0),
          driver_allowance: r ? paiseToRupeesInput(r.driver_allowance_per_day_paise) : "",
          night_charge: r ? paiseToRupeesInput(r.night_charge_paise) : "",
          extra_km: r ? paiseToRupeesInput(r.extra_km_paise) : "",
          tolls_included: r?.tolls_included ?? false,
          waiting_free_minutes: r?.waiting_free_minutes ?? 45,
          waiting_per_hour: r ? paiseToRupeesInput(r.waiting_per_hour_paise) : "",
          is_active: r?.is_active ?? true,
        };
      }),
    ),
  };
}

// ---------------------------------------------------------------- routes

export function routeRow(form: RouteForm): TablesInsert<"cab_routes"> {
  return {
    slug: form.slug,
    trip_type: form.trip_type,
    from_place_id: form.from_place_id,
    to_place_id: form.to_place_id,
    // Nullable column (routes without a name show "From → To"); the generated type is stricter.
    name: form.name as LocalizedJson,
    description: form.description,
    stops: form.stops.map((s) => s.name),
    distance_km: form.distance_km,
    duration_minutes: form.duration_minutes,
    is_popular: form.is_popular,
    is_active: form.is_active,
    sort_order: form.sort_order,
  };
}

export const NEW_ROUTE: Omit<RouteFormInput, "from_place_id" | "to_place_id"> = {
  slug: "",
  trip_type: "one_way",
  name: emptyLocalized,
  description: emptyLocalized,
  stops: [],
  distance_km: "",
  duration_minutes: 60,
  is_popular: false,
  is_active: true,
  sort_order: 100,
};

/** Stored stops (a JSON array of names) → form rows; anything else is dropped. */
export function stopsInput(stops: Json): { name: string }[] {
  return Array.isArray(stops)
    ? stops.flatMap((s) => (typeof s === "string" && s.trim() ? [{ name: s }] : []))
    : [];
}

export function routeFormValues(r: Tables<"cab_routes">): RouteFormInput {
  return {
    id: r.id,
    slug: r.slug,
    trip_type: r.trip_type,
    from_place_id: r.from_place_id,
    to_place_id: r.to_place_id,
    name: localizedInput(r.name),
    description: localizedInput(r.description),
    stops: stopsInput(r.stops),
    distance_km: String(Number(r.distance_km)),
    duration_minutes: r.duration_minutes,
    is_popular: r.is_popular,
    is_active: r.is_active,
    sort_order: r.sort_order,
  };
}

export function routeFaresValues(
  routeId: string,
  categories: readonly Pick<Tables<"cab_categories">, "id">[],
  fares: readonly Tables<"cab_route_fares">[],
) {
  return {
    route_id: routeId,
    fares: categories.map((c) => {
      const f = fares.find((x) => x.category_id === c.id);
      return {
        category_id: c.id,
        fare: f ? paiseToRupeesInput(f.fare_paise) : "",
        extra_km: f ? paiseToRupeesInput(f.extra_km_paise ?? 0) : "",
        tolls_included: f?.tolls_included ?? false,
      };
    }),
  };
}

// ---------------------------------------------------------------- local packages

export function newPackageValues(
  categories: readonly Pick<Tables<"cab_categories">, "id">[],
): PackageFormInput {
  return {
    key: "",
    name: emptyLocalized,
    hours: 8,
    km: 80,
    is_active: true,
    sort_order: 100,
    fares: categories.map((c) => ({ category_id: c.id, fare: "", extra_km: "", extra_hour: "" })),
  };
}

export function packageFormValues(
  p: Tables<"cab_local_packages">,
  categories: readonly Pick<Tables<"cab_categories">, "id">[],
  fares: readonly Tables<"cab_local_fares">[],
): PackageFormInput {
  return {
    id: p.id,
    key: p.key,
    name: localizedInput(p.name),
    hours: p.hours,
    km: p.km,
    is_active: p.is_active,
    sort_order: p.sort_order,
    fares: categories.map((c) => {
      const f = fares.find((x) => x.category_id === c.id);
      return {
        category_id: c.id,
        fare: f ? paiseToRupeesInput(f.fare_paise) : "",
        extra_km: f ? paiseToRupeesInput(f.extra_km_paise) : "",
        extra_hour: f ? paiseToRupeesInput(f.extra_hour_paise) : "",
      };
    }),
  };
}

// ---------------------------------------------------------------- add-ons

export function addonRow(form: AddonForm): TablesInsert<"cab_addons"> {
  return {
    key: form.key,
    name: form.name,
    description: form.description,
    price_paise: form.price,
    trip_types: sortedUnique(form.trip_types),
    category_ids: sortedUnique(form.category_ids),
    is_active: form.is_active,
    sort_order: form.sort_order,
  };
}

export const NEW_ADDON: AddonFormInput = {
  key: "",
  name: emptyLocalized,
  description: emptyLocalized,
  price: "",
  trip_types: [],
  category_ids: [],
  is_active: true,
  sort_order: 100,
};

export function addonFormValues(a: Tables<"cab_addons">): AddonFormInput {
  return {
    id: a.id,
    key: a.key,
    name: localizedInput(a.name),
    description: localizedInput(a.description),
    price: paiseToRupeesInput(a.price_paise),
    trip_types: a.trip_types,
    category_ids: a.category_ids,
    is_active: a.is_active,
    sort_order: a.sort_order,
  };
}

// ---------------------------------------------------------------- peak pricing

export function surchargeRow(form: SurchargeForm): TablesInsert<"cab_surcharges"> {
  return {
    name: form.name,
    multiplier_bps: percentToBps(form.multiplier_percent),
    starts_on: form.starts_on,
    ends_on: form.ends_on,
    weekdays: sortedUnique(form.weekdays),
    trip_types: sortedUnique(form.trip_types),
    category_ids: sortedUnique(form.category_ids),
    is_active: form.is_active,
  };
}

export const NEW_SURCHARGE: SurchargeFormInput = {
  name: emptyLocalized,
  multiplier_percent: "125",
  starts_on: "",
  ends_on: "",
  weekdays: [],
  trip_types: [],
  category_ids: [],
  is_active: true,
};

export function surchargeFormValues(s: Tables<"cab_surcharges">): SurchargeFormInput {
  return {
    id: s.id,
    name: localizedInput(s.name),
    multiplier_percent: bpsToPercentInput(s.multiplier_bps),
    starts_on: s.starts_on ?? "",
    ends_on: s.ends_on ?? "",
    weekdays: s.weekdays,
    trip_types: s.trip_types,
    category_ids: s.category_ids,
    is_active: s.is_active,
  };
}

/** 12500 → "125%". */
export function multiplierLabel(bps: number): string {
  return `${bpsToPercentInput(bps)}%`;
}

// ---------------------------------------------------------------- drivers

export function driverRow(form: DriverForm, userId: string | null): TablesInsert<"drivers"> {
  return {
    full_name: form.full_name,
    phone: form.phone,
    alt_phone: form.alt_phone,
    licence_no: form.licence_no ? form.licence_no.toUpperCase() : null,
    licence_expiry: form.licence_expiry,
    languages: form.languages,
    rating: form.rating === null ? null : Math.round(form.rating * 10) / 10,
    is_active: form.is_active,
    notes: form.notes,
    user_id: userId,
  };
}

export const NEW_DRIVER: DriverFormInput = {
  full_name: "",
  phone: "",
  alt_phone: "",
  licence_no: "",
  licence_expiry: "",
  languages: "Hindi",
  rating: "",
  is_active: true,
  notes: "",
  login_email: "",
};

export function driverFormValues(d: Tables<"drivers">, loginEmail: string | null): DriverFormInput {
  return {
    id: d.id,
    full_name: d.full_name,
    phone: d.phone,
    alt_phone: d.alt_phone ?? "",
    licence_no: d.licence_no ?? "",
    licence_expiry: d.licence_expiry ?? "",
    languages: d.languages.join(", "),
    rating: d.rating === null ? "" : String(Number(d.rating)),
    is_active: d.is_active,
    notes: d.notes ?? "",
    login_email: loginEmail ?? "",
  };
}

// ---------------------------------------------------------------- vehicles

export function vehicleRow(form: VehicleForm): TablesInsert<"vehicles"> {
  return {
    category_id: form.category_id,
    model_id: form.model_id,
    registration_no: form.registration_no,
    colour: form.colour,
    year: form.year,
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

export function newVehicleValues(categoryId: string): VehicleFormInput {
  return {
    category_id: categoryId,
    model_id: "",
    registration_no: "",
    colour: "",
    year: "",
    fuel: "cng",
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

export function vehicleFormValues(v: Tables<"vehicles">): VehicleFormInput {
  return {
    id: v.id,
    category_id: v.category_id,
    model_id: v.model_id ?? "",
    registration_no: v.registration_no,
    colour: v.colour ?? "",
    year: v.year === null ? "" : String(v.year),
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

/** A document's expiry also updates the matching date on its driver / vehicle. */
export function paperColumn(
  ownerType: "driver" | "vehicle",
  kind: string,
):
  | "licence_expiry"
  | "rc_expiry"
  | "insurance_expiry"
  | "permit_expiry"
  | "puc_expiry"
  | "fitness_expiry"
  | null {
  if (ownerType === "driver") return kind === "licence" ? "licence_expiry" : null;
  switch (kind) {
    case "rc":
      return "rc_expiry";
    case "insurance":
      return "insurance_expiry";
    case "permit":
      return "permit_expiry";
    case "puc":
      return "puc_expiry";
    case "fitness":
      return "fitness_expiry";
    default:
      return null;
  }
}

/** Storage extension for an accepted document type. */
export function documentExtension(mime: string): "pdf" | "jpg" | "png" | "webp" {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

// ---------------------------------------------------------------- dispatch

/** Board columns; other statuses are not on the board. */
export type DispatchGroup = "unassigned" | "assigned" | "inProgress";

export function dispatchGroup(status: TripStatus): DispatchGroup | null {
  switch (status) {
    case "unassigned":
      return "unassigned";
    case "assigned":
      return "assigned";
    case "en_route":
    case "arrived":
    case "picked_up":
      return "inProgress";
    default:
      return null;
  }
}

export const DISPATCH_STATUSES: readonly TripStatus[] = [
  "unassigned",
  "assigned",
  "en_route",
  "arrived",
  "picked_up",
];

/** Next steps staff may take; mirrors the transitions in set_trip_status(). */
export function nextTripSteps(status: TripStatus): TripStep[] {
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

/** assign_trip() accepts these: a driver can be swapped until the pickup. */
export function canAssign(status: TripStatus): boolean {
  return status === "unassigned" || status === "assigned" || status === "en_route";
}

export function tripTone(status: TripStatus): Tone {
  switch (status) {
    case "unassigned":
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

export type VehicleChoice = {
  id: string;
  label: string;
  categoryId: string;
  defaultDriverId: string | null;
  /** A higher category than booked. */
  upgrade: boolean;
};

/**
 * Vehicles that can serve a trip: the booked category first, then higher
 * categories (by the catalog order) marked as upgrades. Smaller categories
 * are left out so a booked seat count is never short.
 */
export function vehicleChoices(
  bookedCategoryId: string,
  categories: readonly Pick<Tables<"cab_categories">, "id" | "sort_order">[],
  vehicles: readonly {
    id: string;
    category_id: string;
    registration_no: string;
    default_driver_id: string | null;
    label: string;
  }[],
): VehicleChoice[] {
  const rank = new Map(categories.map((c, i) => [c.id, [c.sort_order, i] as const]));
  const booked = rank.get(bookedCategoryId);
  const compare = (a: string, b: string) => {
    const ra = rank.get(a) ?? [Infinity, Infinity];
    const rb = rank.get(b) ?? [Infinity, Infinity];
    return ra[0] - rb[0] || ra[1] - rb[1];
  };
  return vehicles
    .filter(
      (v) =>
        v.category_id === bookedCategoryId ||
        (booked && rank.has(v.category_id) && compare(v.category_id, bookedCategoryId) > 0),
    )
    .map((v) => ({
      id: v.id,
      label: v.label,
      categoryId: v.category_id,
      defaultDriverId: v.default_driver_id,
      upgrade: v.category_id !== bookedCategoryId,
    }))
    .sort(
      (a, b) =>
        Number(a.upgrade) - Number(b.upgrade) ||
        compare(a.categoryId, b.categoryId) ||
        a.label.localeCompare(b.label),
    );
}

/** Database errors raised by assign_trip / set_trip_status → message keys under cabsAdmin.errors. */
export function tripErrorKey(message: string): string {
  const codes = {
    driver_unavailable: "driverUnavailable",
    vehicle_unavailable: "vehicleUnavailable",
    invalid_transition: "invalidTransition",
    otp_mismatch: "otpMismatch",
    not_found: "notFound",
  } as const;
  for (const [code, key] of Object.entries(codes)) {
    if (message.includes(code)) return key;
  }
  return "actionFailed";
}

/** Driver trip page for a token; the site URL's trailing slash is ignored. */
export function driverTripUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, "")}/driver/trip/${token}`;
}

// ---------------------------------------------------------------- trips list

/** Reads Next's `searchParams` into trip filters; a reversed date range is swapped. */
export function parseTripFilters(raw: Record<string, string | string[] | undefined>): TripFilters {
  const flat: Record<string, string> = {};
  for (const [k, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") flat[k] = v;
  }
  const filters = tripFiltersSchema.parse(flat);
  if (filters.from && filters.to && filters.from > filters.to) {
    return { ...filters, from: filters.to, to: filters.from };
  }
  return filters;
}

export function tripFiltersQuery(filters: Partial<TripFilters>, page = 1): string {
  const params = new URLSearchParams();
  for (const k of ["status", "from", "to"] as const) {
    const value = filters[k];
    if (value) params.set(k, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** India pickup dates [from, to] → instants [start, end) for a `pickup_at` filter. */
export function indiaDayBounds(from: IsoDate | undefined, to: IsoDate | undefined) {
  return {
    start: from ? new Date(`${from}T00:00:00+05:30`).toISOString() : null,
    end: to ? new Date(`${addDays(to, 1)}T00:00:00+05:30`).toISOString() : null,
  };
}

// ---------------------------------------------------------------- settings

/** Settings form → stored `cabs.defaults` value (paise and basis points). */
export function cabSettingsValue(form: CabSettingsForm): CabSettings {
  return {
    advance_percent: form.advance_percent,
    min_advance_paise: form.min_advance,
    tax_bps: percentToBps(form.gst_percent),
    sac: form.sac,
    road_factor: form.road_factor,
    avg_speed_kmph: form.avg_speed_kmph,
    min_lead_minutes: form.min_lead_minutes,
    max_advance_days: form.max_advance_days,
    max_trip_days: form.max_trip_days,
    night_start: form.night_start,
    night_end: form.night_end,
    require_pickup_otp: form.require_pickup_otp,
    hold_minutes: form.hold_minutes,
    // Longest notice first, the order the refund policy reads them in.
    cancellation_rules: [...form.cancellation_rules].sort((a, b) => b.hours_before - a.hours_before),
  };
}

export function cabSettingsFormValues(s: CabSettings): CabSettingsFormInput {
  return {
    advance_percent: s.advance_percent,
    min_advance: paiseToRupeesInput(s.min_advance_paise) || "0",
    gst_percent: bpsToPercentInput(s.tax_bps),
    sac: s.sac,
    road_factor: String(s.road_factor),
    avg_speed_kmph: String(s.avg_speed_kmph),
    min_lead_minutes: s.min_lead_minutes,
    max_advance_days: s.max_advance_days,
    max_trip_days: s.max_trip_days,
    night_start: s.night_start,
    night_end: s.night_end,
    require_pickup_otp: s.require_pickup_otp,
    hold_minutes: s.hold_minutes,
    cancellation_rules: s.cancellation_rules.map((r) => ({
      hours_before: String(r.hours_before),
      refund_percent: r.refund_percent,
    })),
  };
}
