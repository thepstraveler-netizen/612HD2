import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { todayInIndia } from "@/lib/dates";
import { hasServiceRole } from "@/lib/env.server";
import { mediaUrl } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import {
  packagesSettingsSchema,
  travelSettingsSchema,
  type PackagesSettings,
  type TravelSettings,
} from "@/schemas/packages";
import type { Database, Tables } from "@/types/database";
import { fromPrice } from "./pricing";
import type { Departure, PackageDetail, PackageSummary, PricingTier } from "./types";

/**
 * Public package catalog, cached under the `catalog` tag (admin saves clear
 * it). Seats left are cached for a minute at most; checkout re-reads them
 * fresh and the database re-checks under a lock.
 */

type Client = SupabaseClient<Database>;

function fail(scope: string, error: { message: string }): never {
  throw new Error(`[packages] ${scope}: ${error.message}`);
}

async function mediaPaths(client: Client, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  const { data, error } = await client.from("media").select("id, path").in("id", wanted);
  if (error) fail("media", error);
  const out = new Map<string, string>();
  for (const m of data ?? []) {
    const url = mediaUrl(m.path);
    if (url) out.set(m.id, url);
  }
  return out;
}

export function toTier(t: Tables<"package_pricing_tiers">): PricingTier {
  return {
    id: t.id,
    minPax: t.min_pax,
    maxPax: t.max_pax,
    adultPricePaise: t.adult_price_paise,
    childPricePaise: t.child_price_paise,
  };
}

function summary(
  p: Tables<"packages">,
  tiers: PricingTier[],
  imageUrl: string | null,
  nextDeparture: string | null,
): PackageSummary {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    category: p.category,
    destinations: p.destinations,
    startCity: p.start_city,
    days: p.duration_days,
    nights: p.duration_nights,
    imageUrl,
    bookingMode: p.booking_mode,
    fixedDepartures: p.fixed_departures,
    fromPaise: fromPrice(tiers),
    rating: p.rating === null ? null : Number(p.rating),
    isFeatured: p.is_featured,
    nextDeparture,
  };
}

async function loadPackages(client: Client): Promise<PackageSummary[]> {
  const { data: pkgs, error } = await client
    .from("packages")
    .select("*")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("is_featured", { ascending: false })
    .order("sort_order");
  if (error) fail("packages", error);
  if (!pkgs?.length) return [];
  const ids = pkgs.map((p) => p.id);
  const [tiers, deps, images] = await Promise.all([
    client.from("package_pricing_tiers").select("*").in("package_id", ids),
    client
      .from("package_departures")
      .select("package_id, start_date")
      .in("package_id", ids)
      .eq("is_active", true)
      .gte("start_date", todayInIndia())
      .order("start_date"),
    mediaPaths(
      client,
      pkgs.map((p) => p.image_id),
    ),
  ]);
  if (tiers.error) fail("tiers", tiers.error);
  if (deps.error) fail("departures", deps.error);
  return pkgs.map((p) =>
    summary(
      p,
      (tiers.data ?? []).filter((t) => t.package_id === p.id).map(toTier),
      p.image_id ? (images.get(p.image_id) ?? null) : null,
      p.fixed_departures ? ((deps.data ?? []).find((d) => d.package_id === p.id)?.start_date ?? null) : null,
    ),
  );
}

export const getPackages = unstable_cache(
  async (): Promise<PackageSummary[]> => {
    const supabase = createPublicClient();
    if (!supabase) return [];
    return loadPackages(supabase);
  },
  ["packages:list"],
  { tags: [CATALOG_TAG], revalidate: 300 },
);

export async function loadPackage(client: Client, slug: string): Promise<PackageDetail | null> {
  const { data: p, error } = await client
    .from("packages")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail("package", error);
  if (!p) return null;
  const [tiers, deps, days, seats, images] = await Promise.all([
    client.from("package_pricing_tiers").select("*").eq("package_id", p.id).order("min_pax"),
    client
      .from("package_departures")
      .select("*")
      .eq("package_id", p.id)
      .eq("is_active", true)
      .gte("start_date", todayInIndia())
      .order("start_date"),
    client.from("package_itinerary_days").select("*").eq("package_id", p.id).order("day_number"),
    client.rpc("package_departure_seats", { p_package_id: p.id }),
    mediaPaths(client, [p.image_id, ...p.gallery_ids]),
  ]);
  if (tiers.error) fail("tiers", tiers.error);
  if (deps.error) fail("departures", deps.error);
  if (days.error) fail("itinerary", days.error);
  if (seats.error) fail("seats", seats.error);
  const seatsLeft = new Map((seats.data ?? []).map((s) => [s.departure_id, s.seats_left]));
  const tierList = (tiers.data ?? []).map(toTier);
  const departures: Departure[] = (deps.data ?? []).map((d) => ({
    id: d.id,
    startDate: d.start_date,
    seatsTotal: d.seats_total,
    seatsLeft: d.seats_total === null ? null : (seatsLeft.get(d.id) ?? d.seats_total),
    supplementPaise: d.supplement_paise,
    note: d.note,
  }));
  return {
    ...summary(
      p,
      tierList,
      p.image_id ? (images.get(p.image_id) ?? null) : null,
      p.fixed_departures ? (departures[0]?.startDate ?? null) : null,
    ),
    description: p.description,
    gallery: p.gallery_ids.map((id) => images.get(id)).filter((u): u is string => Boolean(u)),
    highlights: p.highlights,
    inclusions: p.inclusions,
    exclusions: p.exclusions,
    terms: p.terms,
    minPax: p.min_pax,
    maxPax: p.max_pax,
    advancePercent: p.advance_percent,
    taxBps: p.tax_bps,
    sac: p.sac,
    tiers: tierList,
    departures,
    itinerary: (days.data ?? []).map((d) => ({
      id: d.id,
      day: d.day_number,
      title: d.title,
      description: d.description,
      meals: d.meals,
      overnight: d.overnight,
    })),
  };
}

export const getPackage = unstable_cache(
  async (slug: string): Promise<PackageDetail | null> => {
    const supabase = createPublicClient();
    if (!supabase) return null;
    return loadPackage(supabase, slug);
  },
  ["packages:detail"],
  { tags: [CATALOG_TAG], revalidate: 60 },
);

/** Live package for checkout (service role, uncached: seats must be current). */
export async function getLivePackage(slug: string): Promise<PackageDetail | null> {
  if (!hasServiceRole()) return null;
  return loadPackage(createAdminClient(), slug);
}

async function readSetting(key: string): Promise<unknown> {
  const supabase = createPublicClient();
  if (!supabase) return {};
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? {};
}

export const getPackagesSettings = unstable_cache(
  async (): Promise<PackagesSettings> => {
    const parsed = packagesSettingsSchema.safeParse(await readSetting("packages.defaults"));
    return parsed.success ? parsed.data : packagesSettingsSchema.parse({});
  },
  ["packages:settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);

export const getTravelSettings = unstable_cache(
  async (): Promise<TravelSettings> => {
    const parsed = travelSettingsSchema.safeParse(await readSetting("travel.defaults"));
    return parsed.success ? parsed.data : travelSettingsSchema.parse({});
  },
  ["travel:settings"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);
