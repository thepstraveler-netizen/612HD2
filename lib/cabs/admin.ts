import "server-only";
import { todayInIndia } from "@/lib/dates";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { mediaUrl } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TripFilters } from "@/schemas/cab-admin";
import type { Tables } from "@/types/database";
import { DISPATCH_STATUSES, indiaDayBounds } from "./admin-rows";
import { fleetExpiryAlerts } from "./expiry";

/**
 * Admin reads for the cabs module. Catalog and fleet rows are read as the
 * signed-in user (RLS: cabs.read), uncached, inactive rows included.
 * Booking contact details on the dispatch board and trip pages, and signed
 * links to fleet documents, need the service role: the callers have already
 * checked cabs.read (requirePermission) and only those columns leave here.
 * The driver link token is never read here (see lib/cabs/admin-actions.ts).
 */

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[cabs admin] ${scope}: ${error.message}`);
}

export const TRIPS_PAGE_SIZE = 25;
const DOCUMENT_LINK_SECONDS = 10 * 60;

// ---------------------------------------------------------------- catalog

export async function listPlaces() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cab_places").select("*").order("sort_order").order("slug");
  if (error) fail("places", error);
  return data;
}

export async function getPlace(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cab_places").select("*").eq("id", id).maybeSingle();
  if (error) fail("place", error);
  return data;
}

export async function listCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cab_categories").select("*").order("sort_order").order("key");
  if (error) fail("categories", error);
  return data;
}

export async function listModels() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cab_models").select("*").order("sort_order").order("name");
  if (error) fail("models", error);
  return data;
}

export async function getCategory(id: string) {
  const supabase = await createClient();
  const [category, models] = await Promise.all([
    supabase.from("cab_categories").select("*, image:image_id (path)").eq("id", id).maybeSingle(),
    supabase.from("cab_models").select("*").eq("category_id", id).order("sort_order").order("name"),
  ]);
  if (category.error) fail("category", category.error);
  if (models.error) fail("models", models.error);
  if (!category.data) return null;
  const { image, ...row } = category.data;
  return {
    category: row as Tables<"cab_categories">,
    models: models.data,
    imageUrl: mediaUrl((image as { path: string } | null)?.path),
  };
}

export async function listFareRules() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cab_fare_rules").select("*");
  if (error) fail("fare rules", error);
  return data;
}

export async function listRoutes() {
  const supabase = await createClient();
  const [routes, fares] = await Promise.all([
    supabase.from("cab_routes").select("*").order("sort_order").order("slug"),
    supabase.from("cab_route_fares").select("route_id"),
  ]);
  if (routes.error) fail("routes", routes.error);
  if (fares.error) fail("route fares", fares.error);
  const fareCount = new Map<string, number>();
  for (const f of fares.data) fareCount.set(f.route_id, (fareCount.get(f.route_id) ?? 0) + 1);
  return routes.data.map((r) => ({ ...r, fareCount: fareCount.get(r.id) ?? 0 }));
}

export async function getRoute(id: string) {
  const supabase = await createClient();
  const [route, fares] = await Promise.all([
    supabase.from("cab_routes").select("*").eq("id", id).maybeSingle(),
    supabase.from("cab_route_fares").select("*").eq("route_id", id),
  ]);
  if (route.error) fail("route", route.error);
  if (fares.error) fail("route fares", fares.error);
  return route.data ? { route: route.data, fares: fares.data } : null;
}

export async function listPackages() {
  const supabase = await createClient();
  const [packages, fares] = await Promise.all([
    supabase.from("cab_local_packages").select("*").order("sort_order").order("key"),
    supabase.from("cab_local_fares").select("package_id, fare_paise"),
  ]);
  if (packages.error) fail("packages", packages.error);
  if (fares.error) fail("package fares", fares.error);
  return packages.data.map((p) => {
    const own = fares.data.filter((f) => f.package_id === p.id).map((f) => f.fare_paise);
    return { ...p, fareCount: own.length, fromPaise: own.length ? Math.min(...own) : null };
  });
}

export async function getPackage(id: string) {
  const supabase = await createClient();
  const [pkg, fares] = await Promise.all([
    supabase.from("cab_local_packages").select("*").eq("id", id).maybeSingle(),
    supabase.from("cab_local_fares").select("*").eq("package_id", id),
  ]);
  if (pkg.error) fail("package", pkg.error);
  if (fares.error) fail("package fares", fares.error);
  return pkg.data ? { pkg: pkg.data, fares: fares.data } : null;
}

export async function listAddons() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cab_addons").select("*").order("sort_order").order("key");
  if (error) fail("add-ons", error);
  return data;
}

export async function getAddon(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cab_addons").select("*").eq("id", id).maybeSingle();
  if (error) fail("add-on", error);
  return data;
}

export async function listSurcharges() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cab_surcharges")
    .select("*")
    .order("is_active", { ascending: false })
    .order("starts_on", { nullsFirst: true })
    .order("created_at");
  if (error) fail("surcharges", error);
  return data;
}

export async function getSurcharge(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cab_surcharges").select("*").eq("id", id).maybeSingle();
  if (error) fail("surcharge", error);
  return data;
}

// ---------------------------------------------------------------- fleet

export async function listDrivers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .is("deleted_at", null)
    .order("is_active", { ascending: false })
    .order("full_name");
  if (error) fail("drivers", error);
  return data;
}

export async function listVehicles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .is("deleted_at", null)
    .order("is_active", { ascending: false })
    .order("registration_no");
  if (error) fail("vehicles", error);
  return data;
}

/** A driver with the email of their linked login, if any (profiles are read with the service role). */
export async function getDriver(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail("driver", error);
  if (!data) return null;
  let loginEmail: string | null = null;
  if (data.user_id) {
    const profile = await createAdminClient()
      .from("profiles")
      .select("email")
      .eq("id", data.user_id)
      .maybeSingle();
    if (profile.error) fail("driver login", profile.error);
    loginEmail = profile.data?.email ?? null;
  }
  return { driver: data, loginEmail };
}

export async function getVehicle(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail("vehicle", error);
  return data;
}

export type FleetDocument = Tables<"fleet_documents"> & { url: string | null };

/** Documents of one driver or vehicle with short-lived signed links (private bucket). */
export async function listFleetDocuments(
  ownerType: "driver" | "vehicle",
  ownerId: string,
): Promise<FleetDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fleet_documents")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) fail("documents", error);
  if (!data.length) return [];
  const { data: links, error: linkError } = await createAdminClient()
    .storage.from("documents")
    .createSignedUrls(
      data.map((d) => d.file_path),
      DOCUMENT_LINK_SECONDS,
    );
  if (linkError) console.error("[cabs admin] document links", linkError);
  const url = new Map((links ?? []).map((l) => [l.path, l.signedUrl]));
  return data.map((d) => ({ ...d, url: url.get(d.file_path) ?? null }));
}

/** Expiry alerts across active drivers and vehicles (dispatch board banner). */
export async function getFleetAlerts() {
  const [drivers, vehicles] = await Promise.all([listDrivers(), listVehicles()]);
  return fleetExpiryAlerts(
    drivers.filter((d) => d.is_active),
    vehicles.filter((v) => v.is_active),
    todayInIndia(),
  );
}

// ---------------------------------------------------------------- trips

type BookingContact = { id: string; code: string; contact_name: string; contact_phone: string };

/** Code and contact of the bookings behind some trips (service role; the caller checked cabs.read). */
async function bookingContacts(ids: string[]): Promise<Map<string, BookingContact>> {
  if (!ids.length) return new Map();
  const { data, error } = await createAdminClient()
    .from("bookings")
    .select("id, code, contact_name, contact_phone")
    .in("id", [...new Set(ids)]);
  if (error) fail("bookings", error);
  return new Map(data.map((b) => [b.id, b]));
}

/** Names for the ids a trip points at, in the viewer's language. */
export type TripLookups = {
  places: Map<string, string>;
  categories: Map<string, string>;
  routes: Map<string, string>;
  packages: Map<string, string>;
};

export async function tripLookups(locale: string): Promise<TripLookups> {
  const supabase = await createClient();
  const [places, categories, routes, packages] = await Promise.all([
    supabase.from("cab_places").select("id, name"),
    supabase.from("cab_categories").select("id, name"),
    supabase.from("cab_routes").select("id, name, slug"),
    supabase.from("cab_local_packages").select("id, name"),
  ]);
  for (const [scope, res] of [
    ["places", places],
    ["categories", categories],
    ["routes", routes],
    ["packages", packages],
  ] as const) {
    if (res.error) fail(scope, res.error);
  }
  const name = (rows: { id: string; name: LocalizedJson | null }[] | null) =>
    new Map((rows ?? []).map((r) => [r.id, pickLocalized(r.name, locale)]));
  return {
    places: name(places.data),
    categories: name(categories.data),
    routes: new Map(
      (routes.data ?? []).map((r) => [r.id, r.name?.en ? pickLocalized(r.name, locale) : r.slug]),
    ),
    packages: name(packages.data),
  };
}

const TRIP_COLUMNS =
  "id, booking_id, trip_type, category_id, route_id, package_id, pickup_place_id, drop_place_id, pickup_address, drop_address, stops, pickup_at, return_at, passengers, distance_km, status, driver_id, vehicle_id, driver_name, driver_phone, vehicle_label, vehicle_registration, assigned_at, started_at, picked_up_at, completed_at, pickup_otp, created_at, updated_at";

export type AdminTrip = Omit<Tables<"trips">, "driver_token" | "driver_token_expires_at"> & {
  booking: BookingContact | null;
};

/** Paid trips not yet finished, soonest pickup first (overdue ones stay on the board). */
export async function listDispatchTrips(): Promise<AdminTrip[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .in("status", [...DISPATCH_STATUSES])
    .order("pickup_at")
    .limit(500);
  if (error) fail("dispatch", error);
  const contacts = await bookingContacts(data.map((t) => t.booking_id));
  return data.map((t) => ({ ...t, booking: contacts.get(t.booking_id) ?? null }));
}

export async function listTrips(filters: TripFilters): Promise<{ rows: AdminTrip[]; total: number }> {
  const supabase = await createClient();
  const from = (filters.page - 1) * TRIPS_PAGE_SIZE;
  let query = supabase.from("trips").select(TRIP_COLUMNS, { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  const { start, end } = indiaDayBounds(filters.from, filters.to);
  if (start) query = query.gte("pickup_at", start);
  if (end) query = query.lt("pickup_at", end);
  const { data, error, count } = await query
    .order("pickup_at", { ascending: false })
    .range(from, from + TRIPS_PAGE_SIZE - 1);
  if (error) fail("trips", error);
  const contacts = await bookingContacts(data.map((t) => t.booking_id));
  return {
    rows: data.map((t) => ({ ...t, booking: contacts.get(t.booking_id) ?? null })),
    total: count ?? 0,
  };
}

export async function getTrip(id: string) {
  const supabase = await createClient();
  const [trip, events] = await Promise.all([
    supabase.from("trips").select(TRIP_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("trip_events").select("*").eq("trip_id", id).order("created_at"),
  ]);
  if (trip.error) fail("trip", trip.error);
  if (events.error) fail("trip events", events.error);
  if (!trip.data) return null;
  const contacts = await bookingContacts([trip.data.booking_id]);
  return {
    trip: { ...trip.data, booking: contacts.get(trip.data.booking_id) ?? null } as AdminTrip,
    events: events.data,
  };
}

/** Active drivers and vehicles for the assign dialog. */
export async function getAssignOptions() {
  const supabase = await createClient();
  const [drivers, vehicles, models] = await Promise.all([
    supabase
      .from("drivers")
      .select("id, full_name, phone")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("vehicles")
      .select("id, category_id, model_id, registration_no, colour, default_driver_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("registration_no"),
    supabase.from("cab_models").select("id, name"),
  ]);
  if (drivers.error) fail("drivers", drivers.error);
  if (vehicles.error) fail("vehicles", vehicles.error);
  if (models.error) fail("models", models.error);
  const modelName = new Map(models.data.map((m) => [m.id, m.name]));
  return {
    drivers: drivers.data,
    vehicles: vehicles.data.map((v) => ({
      ...v,
      label: [v.registration_no, v.model_id ? modelName.get(v.model_id) : null, v.colour]
        .filter(Boolean)
        .join(" · "),
    })),
  };
}
