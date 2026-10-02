import "server-only";
import { todayInIndia } from "@/lib/dates";
import { mediaUrl } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PackageFilters } from "@/schemas/package-admin";
import type { Tables } from "@/types/database";
import {
  bookingsByPackage,
  isLiveBooking,
  lowestAdultPrice,
  nextDepartureDate,
  packageStatus,
  seatsBookedByDeparture,
  seatsLeft,
  type LiveBooking,
} from "./admin-rows";

/**
 * Admin reads for tour packages. The catalog (packages, itinerary days,
 * tiers, departures) is read as the signed-in user (RLS: packages.read),
 * uncached, hidden and archived packages included. Seat and booking counts
 * need booking statuses, which package staff may not read (bookings.read),
 * so they are counted with the service role: the callers have already
 * checked packages.read (requirePermission) and only counts leave here.
 */

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[packages admin] ${scope}: ${error.message}`);
}

/** PostgREST keeps `in (...)` lists in the URL; read booking statuses in slices. */
const IN_CHUNK = 150;

export type GalleryImage = { mediaId: string; url: string };

async function mediaUrls(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!wanted.length) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("media").select("id, path").in("id", wanted);
  if (error) fail("media", error);
  const out = new Map<string, string>();
  for (const m of data) {
    const url = mediaUrl(m.path);
    if (url) out.set(m.id, url);
  }
  return out;
}

/** Package bookings that hold seats (confirmed, or an unexpired unpaid hold), optionally for one package. */
async function liveBookings(packageId?: string): Promise<LiveBooking[]> {
  const admin = createAdminClient();
  let query = admin.from("package_bookings").select("booking_id, package_id, departure_id, adults, children");
  if (packageId) query = query.eq("package_id", packageId);
  const { data: rows, error } = await query;
  if (error) fail("package bookings", error);
  if (!rows.length) return [];
  const live = new Set<string>();
  const now = Date.now();
  for (let i = 0; i < rows.length; i += IN_CHUNK) {
    const ids = rows.slice(i, i + IN_CHUNK).map((r) => r.booking_id);
    const { data, error: e } = await admin.from("bookings").select("id, status, expires_at").in("id", ids);
    if (e) fail("bookings", e);
    for (const b of data) if (isLiveBooking(b, now)) live.add(b.id);
  }
  return rows
    .filter((r) => live.has(r.booking_id))
    .map((r) => ({ package_id: r.package_id, departure_id: r.departure_id, pax: r.adults + r.children }));
}

// ---------------------------------------------------------------- list

export type AdminPackageRow = Tables<"packages"> & {
  status: ReturnType<typeof packageStatus>;
  fromPaise: number | null;
  nextDeparture: string | null;
  tierCount: number;
  bookings: number;
};

/** Packages for Admin → Packages; archived ones only when the status filter asks for them. */
export async function listAdminPackages(filters: PackageFilters): Promise<AdminPackageRow[]> {
  const supabase = await createClient();
  let query = supabase.from("packages").select("*").order("sort_order").order("slug");
  if (filters.status === "archived") query = query.not("deleted_at", "is", null);
  else {
    query = query.is("deleted_at", null);
    if (filters.status) query = query.eq("is_active", filters.status === "live");
  }
  if (filters.mode) query = query.eq("booking_mode", filters.mode);
  if (filters.category) query = query.eq("category", filters.category);
  const [packages, tiers, departures, bookings] = await Promise.all([
    query,
    supabase.from("package_pricing_tiers").select("package_id, adult_price_paise"),
    supabase.from("package_departures").select("package_id, start_date, is_active"),
    liveBookings(),
  ]);
  if (packages.error) fail("packages", packages.error);
  if (tiers.error) fail("tiers", tiers.error);
  if (departures.error) fail("departures", departures.error);

  const q = filters.q?.toLowerCase();
  const today = todayInIndia();
  const counts = bookingsByPackage(bookings);
  return packages.data
    .filter(
      (p) =>
        !q ||
        p.slug.includes(q) ||
        p.title.en.toLowerCase().includes(q) ||
        (p.title.hi ?? "").includes(filters.q ?? "") ||
        p.destinations.some((d) => d.toLowerCase().includes(q)),
    )
    .map((p) => {
      const own = tiers.data.filter((t) => t.package_id === p.id);
      return {
        ...p,
        status: packageStatus(p),
        fromPaise: lowestAdultPrice(own),
        nextDeparture: p.fixed_departures
          ? nextDepartureDate(
              departures.data.filter((d) => d.package_id === p.id),
              today,
            )
          : null,
        tierCount: own.length,
        bookings: counts.get(p.id) ?? 0,
      };
    });
}

/** Categories in use, for the list filter. */
export async function listPackageCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("packages").select("category");
  if (error) fail("categories", error);
  return [...new Set(data.map((p) => p.category))].sort();
}

// ---------------------------------------------------------------- editor

export type AdminDeparture = Tables<"package_departures"> & {
  booked: number;
  /** Null = no seat limit. */
  left: number | null;
};

export type AdminPackage = {
  pkg: Tables<"packages">;
  imageUrl: string | null;
  gallery: GalleryImage[];
  days: Tables<"package_itinerary_days">[];
  tiers: Tables<"package_pricing_tiers">[];
  departures: AdminDeparture[];
  bookings: number;
};

/** One package (archived included) with its itinerary, tiers, departures and seat counts. */
export async function getAdminPackage(id: string): Promise<AdminPackage | null> {
  const supabase = await createClient();
  const [pkg, days, tiers, departures, seats, bookings] = await Promise.all([
    supabase.from("packages").select("*").eq("id", id).maybeSingle(),
    supabase.from("package_itinerary_days").select("*").eq("package_id", id).order("day_number"),
    supabase.from("package_pricing_tiers").select("*").eq("package_id", id).order("min_pax"),
    supabase.from("package_departures").select("*").eq("package_id", id).order("start_date"),
    supabase.rpc("package_departure_seats", { p_package_id: id }),
    liveBookings(id),
  ]);
  if (pkg.error) fail("package", pkg.error);
  if (days.error) fail("itinerary", days.error);
  if (tiers.error) fail("tiers", tiers.error);
  if (departures.error) fail("departures", departures.error);
  if (seats.error) fail("seats", seats.error);
  if (!pkg.data) return null;

  const images = await mediaUrls([pkg.data.image_id, ...pkg.data.gallery_ids]);
  const fromDatabase = new Map(seats.data.map((s) => [s.departure_id, s.seats_left]));
  const booked = seatsBookedByDeparture(bookings);
  return {
    pkg: pkg.data,
    imageUrl: pkg.data.image_id ? (images.get(pkg.data.image_id) ?? null) : null,
    gallery: pkg.data.gallery_ids.flatMap((mediaId) => {
      const url = images.get(mediaId);
      return url ? [{ mediaId, url }] : [];
    }),
    days: days.data,
    tiers: tiers.data,
    departures: departures.data.map((d) => {
      const count = booked.get(d.id) ?? 0;
      return { ...d, booked: count, left: seatsLeft(d.seats_total, count, fromDatabase.get(d.id)) };
    }),
    bookings: bookings.length,
  };
}
