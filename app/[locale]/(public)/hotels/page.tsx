import { Building2, List, Map as MapIcon, TicketPercent } from "lucide-react";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HotelCard } from "@/components/hotels/hotel-card";
import { HotelFilters, type FilterOptions } from "@/components/hotels/hotel-filters";
import { HotelSearchBar } from "@/components/hotels/hotel-search-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getPathname, Link } from "@/i18n/navigation";
import { indexCalendar } from "@/lib/availability/engine";
import { getBanners } from "@/lib/catalog/queries";
import { daysBetween, todayInIndia } from "@/lib/dates";
import { getGstSlabs, getHotelCalendar, getHotelCatalog, getHotelSearchDefaults } from "@/lib/hotels/queries";
import { searchHotels, stayFromSearch } from "@/lib/hotels/search";
import { countActiveFilters, pickStay, toQuery, withParams, type RawParams } from "@/lib/hotels/url";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { HOTEL_SORTS, parseHotelSearch, PROPERTY_TYPES } from "@/schemas/hotels";
import { pageMetadata } from "@/lib/seo/metadata";

/** Leaflet and its stylesheet load only when the map view is open, not with the list. */
const HotelMap = dynamic(() => import("@/components/hotels/hotel-map").then((m) => m.HotelMap));

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<RawParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "hotels.listing" });
  return pageMetadata({ locale, path: "/hotels", title: t("metaTitle"), description: t("metaDescription") });
}

/**
 * Hotel listing. Everything (search, filters, sort, page, view) is in the
 * URL; the page reads the cached catalog plus live inventory for the dates
 * and runs the pure search in lib/hotels/search.
 */
export default async function HotelsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const query = toQuery(raw);
  const search = parseHotelSearch(raw);
  const t = await getTranslations("hotels");

  const [catalog, defaults, gstSlabs, banners] = await Promise.all([
    getHotelCatalog(),
    getHotelSearchDefaults(),
    getGstSlabs(),
    getBanners(),
  ]);
  const today = todayInIndia();
  const stay = stayFromSearch(search, defaults, today);
  const calendar = stay
    ? await getHotelCalendar(catalog.hotels, stay.checkIn, stay.checkOut)
    : indexCalendar(
        [],
        [],
        catalog.hotels.flatMap((h) => h.rules),
      );
  const result = searchHotels(catalog, search, { calendar, gstSlabs, defaults, today });

  const cityName = (id: string) => {
    const city = catalog.cities.find((c) => c.id === id);
    return city ? pickLocalized(city.name, locale) : "";
  };
  const placeOf = (cityId: string, areaId: string | null) => {
    const area = areaId ? catalog.areas.find((a) => a.id === areaId) : undefined;
    return [area ? pickLocalized(area.name, locale) : null, cityName(cityId)].filter(Boolean).join(", ");
  };
  const defaultCity = catalog.cities.find((c) => c.slug === defaults.city);
  const searchedCity = search.city ? catalog.cities.find((c) => c.slug === search.city) : undefined;

  const filterOptions: FilterOptions = {
    priceBuckets: defaults.price_buckets_paise,
    propertyTypes: PROPERTY_TYPES.filter((type) => catalog.hotels.some((h) => h.propertyType === type)).map(
      (value) => ({ value, label: value }),
    ),
    amenities: catalog.amenities
      .filter((a) => catalog.hotels.some((h) => h.amenityIds.includes(a.id)))
      .map((a) => ({ value: a.slug, label: pickLocalized(a.name, locale) })),
    landmarks: catalog.areas
      .filter((a) => a.lat !== null && a.lng !== null)
      .map((a) => ({ value: a.slug, label: `${pickLocalized(a.name, locale)} (${cityName(a.cityId)})` })),
    radii: defaults.landmark_radii_m,
  };

  const stayQuery = pickStay(query);
  const banner = banners.find((b) => b.tab === "hotels");
  const heading = search.q
    ? t("listing.headingFor", { q: search.q })
    : searchedCity
      ? t("listing.headingIn", { city: pickLocalized(searchedCity.name, locale) })
      : t("listing.heading");
  const landmarkName = result.landmark ? pickLocalized(result.landmark.name, locale) : null;
  const mapCenter = searchedCity ?? defaultCity;

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:space-y-6 sm:py-8">
      <HotelSearchBar
        pathname="/hotels"
        query={query}
        today={today}
        maxRooms={defaults.max_rooms}
        placeholder={defaultCity ? pickLocalized(defaultCity.name, locale) : undefined}
        // With nothing listed the form is the next step, so it stays open.
        collapsible={result.total > 0}
      />

      {banner ? (
        <aside className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-secondary/60 p-3 text-sm sm:p-4">
          <TicketPercent className="size-5 text-primary" aria-hidden="true" />
          <p className="flex-1">
            <span className="font-semibold">{pickLocalized(banner.title, locale)}</span>
            {banner.subtitle ? (
              <span className="text-muted-foreground"> · {pickLocalized(banner.subtitle, locale)}</span>
            ) : null}
          </p>
          {banner.couponCode ? (
            <span className="rounded-lg border bg-card px-2 py-1 font-mono text-xs font-semibold">
              {banner.couponCode}
            </span>
          ) : null}
        </aside>
      ) : null}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[17rem_1fr]">
        <HotelFilters
          variant="aside"
          query={query}
          options={filterOptions}
          activeCount={countActiveFilters(query)}
        />

        <section aria-labelledby="results-heading" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 id="results-heading" className="text-[length:var(--text-title)] font-bold">
                {heading}
              </h1>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {t("listing.count", { count: result.total })}
                {result.stay
                  ? ` · ${t("listing.stayLine", {
                      nights: daysBetween(result.stay.checkIn, result.stay.checkOut),
                      rooms: result.stay.rooms,
                      guests: result.stay.adults + result.stay.children,
                    })}`
                  : ` · ${t("listing.addDates")}`}
              </p>
            </div>
            <div
              className="flex gap-1 rounded-full border bg-card p-1"
              role="group"
              aria-label={t("listing.view")}
            >
              {(["list", "map"] as const).map((view) => {
                const Icon = view === "list" ? List : MapIcon;
                const on = search.view === view;
                return (
                  <Button
                    key={view}
                    asChild
                    size="sm"
                    variant={on ? "default" : "ghost"}
                    className="rounded-full"
                  >
                    <Link
                      href={{
                        pathname: "/hotels",
                        query: withParams(query, { view: view === "list" ? null : view, page: query.page }),
                      }}
                      aria-current={on ? "page" : undefined}
                      scroll={false}
                    >
                      <Icon /> {t(`listing.${view}`)}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Filters (below lg) and sorts share one swipeable chip row on phones. */}
          <div className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            <HotelFilters
              variant="sheet"
              query={query}
              options={filterOptions}
              activeCount={countActiveFilters(query)}
              resultCount={result.total}
            />
            <nav aria-label={t("sort.label")} className="flex gap-2">
              {HOTEL_SORTS.map((sort) => {
                const on = search.sort === sort;
                return (
                  <Link
                    key={sort}
                    href={{
                      pathname: "/hotels",
                      query: withParams(query, { sort: sort === "popular" ? null : sort }),
                    }}
                    aria-current={on ? "true" : undefined}
                    scroll={false}
                    className={cn(
                      "inline-flex min-h-11 shrink-0 snap-start items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap sm:min-h-10",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                    )}
                  >
                    {t(`sort.${sort}`)}
                  </Link>
                );
              })}
            </nav>
          </div>

          {result.total === 0 ? (
            <EmptyState
              icon={Building2}
              title={catalog.hotels.length ? t("listing.noMatchTitle") : t("listing.emptyTitle")}
              description={catalog.hotels.length ? t("listing.noMatchBody") : t("listing.emptyBody")}
              action={
                catalog.hotels.length ? (
                  <Button asChild variant="outline">
                    <Link href={{ pathname: "/hotels", query: stayQuery }}>{t("filters.clear")}</Link>
                  </Button>
                ) : null
              }
            />
          ) : search.view === "map" ? (
            <HotelMap
              className="h-[70vh] min-h-96 overflow-hidden rounded-2xl border"
              label={t("listing.map")}
              tiles={defaults.map_tiles}
              center={[mapCenter?.lat ?? 0, mapCenter?.lng ?? 0]}
              points={result.results
                .filter((r) => r.hotel.lat !== null && r.hotel.lng !== null)
                .map((r) => ({
                  id: r.hotel.id,
                  lat: r.hotel.lat as number,
                  lng: r.hotel.lng as number,
                  label: pickLocalized(r.hotel.name, locale),
                  price:
                    r.displayPaise !== null && !r.unavailable ? formatPaise(r.displayPaise, locale) : null,
                  href: getPathname({
                    locale,
                    href: { pathname: `/hotels/${r.hotel.slug}`, query: stayQuery },
                  }),
                }))}
            />
          ) : (
            <ul className="grid gap-4">
              {result.results.map((r, i) => (
                <li key={r.hotel.id} className="relative">
                  <HotelCard
                    result={r}
                    locale={locale}
                    query={stayQuery}
                    place={placeOf(r.hotel.cityId, r.hotel.areaId)}
                    landmarkName={landmarkName}
                    priority={i === 0}
                  />
                </li>
              ))}
            </ul>
          )}

          {result.pageCount > 1 ? (
            <nav
              aria-label={t("listing.pages")}
              className="flex flex-wrap items-center justify-center gap-2 pt-2"
            >
              {Array.from({ length: result.pageCount }, (_, i) => i + 1).map((page) => (
                <Link
                  key={page}
                  href={{ pathname: "/hotels", query: withParams(query, { page: page === 1 ? null : page }) }}
                  aria-current={page === result.page ? "page" : undefined}
                  className={cn(
                    "grid size-11 place-items-center rounded-full border text-sm font-medium",
                    page === result.page
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card hover:bg-accent",
                  )}
                >
                  {page}
                </Link>
              ))}
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  );
}
