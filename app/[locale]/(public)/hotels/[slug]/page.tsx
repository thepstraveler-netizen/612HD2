import {
  ArrowLeft,
  BedDouble,
  CalendarCheck,
  Check,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  Ruler,
  Users,
  Utensils,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDistance } from "@/components/hotels/hotel-card";
import { HotelGallery } from "@/components/hotels/hotel-gallery";
import { HotelMap } from "@/components/hotels/hotel-map";
import { HotelSearchBar } from "@/components/hotels/hotel-search-bar";
import { RatingBadge, StarRow } from "@/components/hotels/rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { bestOffer, indexCalendar, quoteStay, type QuoteResult } from "@/lib/availability/engine";
import { getFeatureFlag } from "@/lib/bookings/settings";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { daysBetween, todayInIndia } from "@/lib/dates";
import { distanceMeters, mapsUrl } from "@/lib/geo";
import {
  getGstSlabs,
  getHotelBySlug,
  getHotelCalendar,
  getHotelCatalog,
  getHotelSearchDefaults,
} from "@/lib/hotels/queries";
import { stayFromSearch } from "@/lib/hotels/search";
import { pickStay, toQuery, withParams, type RawParams } from "@/lib/hotels/url";
import { cancellationText } from "@/lib/hotels/policy-text";
import { pickLocalized } from "@/lib/i18n/localized";
import { getIcon } from "@/lib/icons";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { parseHotelSearch } from "@/schemas/hotels";

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<RawParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const hotel = await getHotelBySlug(slug);
  if (!hotel) return {};
  const name = pickLocalized(hotel.name, locale);
  return {
    title: hotel.seo.title || name,
    description: hotel.seo.description || (hotel.summary ? pickLocalized(hotel.summary, locale) : undefined),
    openGraph: hotel.images[0] ? { images: [hotel.images[0].url] } : undefined,
  };
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

export default async function HotelPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [catalog, defaults, gstSlabs, business, bookingOpen] = await Promise.all([
    getHotelCatalog(),
    getHotelSearchDefaults(),
    getGstSlabs(),
    getBusinessInfo(),
    getFeatureFlag("booking.hotels"),
  ]);
  const hotel = catalog.hotels.find((h) => h.slug === slug);
  if (!hotel) notFound();

  const raw = await searchParams;
  const query = toQuery(raw);
  const search = parseHotelSearch(raw);
  const t = await getTranslations("hotels");
  const td: Translate = (key, values) => t(`detail.${key}`, values);
  const today = todayInIndia();
  const stay = stayFromSearch(search, defaults, today);
  const calendar = stay
    ? await getHotelCalendar([hotel], stay.checkIn, stay.checkOut)
    : indexCalendar([], [], hotel.rules);

  const name = pickLocalized(hotel.name, locale);
  const city = catalog.cities.find((c) => c.id === hotel.cityId);
  const area = hotel.areaId ? catalog.areas.find((a) => a.id === hotel.areaId) : undefined;
  const place = [
    area ? pickLocalized(area.name, locale) : null,
    city ? pickLocalized(city.name, locale) : null,
  ]
    .filter(Boolean)
    .join(", ");
  const amenities = catalog.amenities.filter((a) => hotel.amenityIds.includes(a.id));
  // Property photos first, then room photos.
  const images = [...hotel.images]
    .sort((a, b) => Number(a.roomId !== null) - Number(b.roomId !== null))
    .map((i) => ({ url: i.url, alt: i.alt ? pickLocalized(i.alt, locale) : name }));
  const nights = stay ? daysBetween(stay.checkIn, stay.checkOut) : 0;

  const quotes = new Map<string, QuoteResult>();
  if (stay) {
    for (const plan of hotel.plans) {
      const room = hotel.rooms.find((r) => r.id === plan.roomId);
      if (room) quotes.set(plan.id, quoteStay(room, plan, stay, calendar, gstSlabs));
    }
  }
  const chosen = query.plan ? quotes.get(query.plan) : undefined;
  const offer = chosen?.ok
    ? chosen
    : stay
      ? bestOffer(hotel.rooms, hotel.plans, stay, calendar, gstSlabs)
      : null;
  const offerPlan = offer?.ok ? hotel.plans.find((p) => p.id === offer.ratePlanId) : undefined;
  const offerRoom = offer?.ok ? hotel.rooms.find((r) => r.id === offer.roomId) : undefined;
  const fromPrice = hotel.plans
    .filter((p) => p.isActive)
    .reduce<number | null>(
      (min, p) => (min === null || p.basePricePaise < min ? p.basePricePaise : min),
      null,
    );

  const nearby =
    hotel.lat !== null && hotel.lng !== null
      ? catalog.areas
          .filter((a) => a.lat !== null && a.lng !== null)
          .map((a) => ({
            area: a,
            m: distanceMeters(
              { lat: hotel.lat as number, lng: hotel.lng as number },
              { lat: a.lat as number, lng: a.lng as number },
            ),
          }))
          .filter((n) => n.m <= 15_000)
          .sort((a, b) => a.m - b.m)
          .slice(0, 6)
      : [];

  const whatsapp = business.whatsapp.replace(/[^0-9]/g, "");
  const enquiry = td("whatsappText", {
    hotel: name,
    dates: stay ? `${stay.checkIn} → ${stay.checkOut}` : td("datesFlexible"),
    rooms: stay?.rooms ?? search.rooms,
    guests: (stay?.adults ?? search.adults) + (stay?.children ?? search.children),
    plan: offerPlan
      ? `${pickLocalized(offerRoom?.name, locale)} · ${pickLocalized(offerPlan.name, locale)}`
      : "-",
  });
  const stayQuery = pickStay(query);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name,
    description: hotel.summary ? pickLocalized(hotel.summary, locale) : undefined,
    image: images.slice(0, 5).map((i) => i.url),
    address: hotel.address ?? undefined,
    geo:
      hotel.lat !== null
        ? { "@type": "GeoCoordinates", latitude: hotel.lat, longitude: hotel.lng }
        : undefined,
    starRating: hotel.starRating ? { "@type": "Rating", ratingValue: hotel.starRating } : undefined,
    aggregateRating:
      hotel.ratingAvg !== null && hotel.ratingCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: hotel.ratingAvg,
            reviewCount: hotel.ratingCount,
            bestRating: 5,
          }
        : undefined,
    checkinTime: hotel.checkInTime,
    checkoutTime: hotel.checkOutTime,
    amenityFeature: amenities.map((a) => ({
      "@type": "LocationFeatureSpecification",
      name: a.name.en,
      value: true,
    })),
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Link
        href={{ pathname: "/hotels", query: stayQuery }}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {td("back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{t(`propertyTypes.${hotel.propertyType}`)}</span>
            {hotel.starRating > 0 ? (
              <StarRow count={hotel.starRating} label={t("card.stars", { count: hotel.starRating })} />
            ) : null}
            {hotel.isCoupleFriendly ? <Badge variant="secondary">{t("card.coupleFriendly")}</Badge> : null}
          </div>
          <h1 className="text-[length:var(--text-title)] leading-tight font-extrabold">{name}</h1>
          <p className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {[hotel.address, place].filter(Boolean).join(" · ")}
              {hotel.lat !== null && hotel.lng !== null ? (
                <>
                  {" · "}
                  <a
                    href={mapsUrl(hotel.lat, hotel.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    {td("openInMaps")}
                  </a>
                </>
              ) : null}
            </span>
          </p>
        </div>
        {hotel.ratingAvg !== null && hotel.ratingCount > 0 ? (
          <RatingBadge rating={hotel.ratingAvg} count={hotel.ratingCount} />
        ) : null}
      </header>

      <HotelGallery images={images} />

      <HotelSearchBar
        pathname={`/hotels/${hotel.slug}`}
        query={query}
        today={today}
        maxRooms={defaults.max_rooms}
        showDestination={false}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-10">
          {hotel.summary || hotel.description ? (
            <section aria-labelledby="about" className="space-y-3">
              <h2 id="about" className="text-xl font-bold">
                {td("about")}
              </h2>
              {hotel.summary ? <p className="font-medium">{pickLocalized(hotel.summary, locale)}</p> : null}
              {hotel.description ? (
                <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
                  {pickLocalized(hotel.description, locale)}
                </p>
              ) : null}
            </section>
          ) : null}

          {hotel.highlights.length ? (
            <section aria-labelledby="highlights" className="space-y-3">
              <h2 id="highlights" className="text-xl font-bold">
                {td("highlights")}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {hotel.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent-green" aria-hidden="true" />
                    {pickLocalized(h, locale)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {amenities.length ? (
            <section aria-labelledby="amenities" className="space-y-3">
              <h2 id="amenities" className="text-xl font-bold">
                {td("amenities")}
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {amenities.map((a) => {
                  const Icon = getIcon(a.icon);
                  return (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      {pickLocalized(a.name, locale)}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="rooms" className="scroll-mt-20 space-y-4" id="rooms-section">
            <h2 id="rooms" className="text-xl font-bold">
              {td("rooms")}
            </h2>
            {!stay ? <p className="text-sm text-muted-foreground">{td("addDatesForPrices")}</p> : null}
            <ul className="grid gap-4">
              {hotel.rooms
                .filter((r) => r.isActive)
                .map((room) => {
                  const roomImage = hotel.images.find((i) => i.roomId === room.id);
                  const roomAmenities = catalog.amenities.filter((a) => room.amenityIds.includes(a.id));
                  return (
                    <li key={room.id} className="overflow-hidden rounded-2xl border bg-card">
                      <div className="grid gap-4 p-4 sm:grid-cols-[12rem_1fr]">
                        <div className="space-y-2">
                          {roomImage ? (
                            // eslint-disable-next-line @next/next/no-img-element -- small thumbnail; next/image needs fixed sizing here
                            <img
                              src={roomImage.url}
                              alt=""
                              loading="lazy"
                              className="aspect-[4/3] w-full rounded-xl object-cover"
                            />
                          ) : null}
                          <h3 className="font-bold">{pickLocalized(room.name, locale)}</h3>
                          <ul className="grid gap-1 text-xs text-muted-foreground">
                            {room.bedType ? (
                              <li className="flex items-center gap-1.5">
                                <BedDouble className="size-3.5" aria-hidden="true" /> {room.bedType}
                              </li>
                            ) : null}
                            {room.sizeSqft ? (
                              <li className="flex items-center gap-1.5">
                                <Ruler className="size-3.5" aria-hidden="true" />{" "}
                                {td("sqft", { size: room.sizeSqft })}
                              </li>
                            ) : null}
                            <li className="flex items-center gap-1.5">
                              <Users className="size-3.5" aria-hidden="true" />
                              {td("occupancy", { adults: room.maxAdults, children: room.maxChildren })}
                            </li>
                            {roomAmenities.map((a) => (
                              <li key={a.id}>· {pickLocalized(a.name, locale)}</li>
                            ))}
                          </ul>
                          {room.description ? (
                            <p className="text-xs">{pickLocalized(room.description, locale)}</p>
                          ) : null}
                        </div>
                        <ul className="grid gap-3">
                          {hotel.plans
                            .filter((p) => p.roomId === room.id && p.isActive)
                            .map((plan) => {
                              const quote = quotes.get(plan.id);
                              const selected = offer?.ok && offer.ratePlanId === plan.id;
                              return (
                                <li
                                  key={plan.id}
                                  className={cn(
                                    "grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_auto] sm:items-end",
                                    selected && "border-primary ring-1 ring-primary",
                                  )}
                                >
                                  <div className="space-y-1 text-sm">
                                    <p className="font-semibold">{pickLocalized(plan.name, locale)}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {t(`mealPlans.${plan.mealPlan}`)}
                                    </p>
                                    <p
                                      className={cn(
                                        "text-xs",
                                        plan.isRefundable && plan.cancellationRules.length
                                          ? "text-accent-green"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {cancellationText(plan.cancellationRules, plan.isRefundable, td)}
                                    </p>
                                    {plan.inclusions.length ? (
                                      <ul className="text-xs text-muted-foreground">
                                        {plan.inclusions.map((inc, i) => (
                                          <li key={i}>✓ {pickLocalized(inc, locale)}</li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                  <div className="space-y-1 sm:text-right">
                                    {quote && !quote.ok ? (
                                      <p className="text-sm font-semibold text-destructive">
                                        {t(`unavailable.${quote.reason}`)}
                                      </p>
                                    ) : quote?.ok ? (
                                      <>
                                        <p className="text-xl font-extrabold">
                                          {formatPaise(quote.avgNightlyPaise, locale)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{t("card.perNight")}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {t("card.total", {
                                            total: formatPaise(quote.totalPaise, locale),
                                            nights,
                                          })}
                                        </p>
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-xs text-muted-foreground">{t("card.from")}</p>
                                        <p className="text-xl font-extrabold">
                                          {formatPaise(plan.basePricePaise, locale)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{t("card.perNight")}</p>
                                      </>
                                    )}
                                    {quote?.ok ? (
                                      <Button asChild size="sm" variant={selected ? "default" : "outline"}>
                                        <Link
                                          href={{
                                            pathname: `/hotels/${hotel.slug}`,
                                            query: withParams(query, { plan: plan.id }),
                                          }}
                                          scroll={false}
                                          aria-current={selected ? "true" : undefined}
                                        >
                                          {selected ? td("selected") : td("select")}
                                        </Link>
                                      </Button>
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>

          <section aria-labelledby="policies" className="space-y-3">
            <h2 id="policies" className="text-xl font-bold">
              {td("policies")}
            </h2>
            <div className="grid gap-3 rounded-2xl border bg-card p-4 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <Clock className="size-4 text-primary" aria-hidden="true" />
                {td("checkInOut", { checkIn: hotel.checkInTime, checkOut: hotel.checkOutTime })}
              </p>
              <p>
                {hotel.policies.unmarried_couples_allowed ? td("couplesWelcome") : td("couplesNotAllowed")}
              </p>
              <p>{hotel.policies.bachelors_allowed ? td("bachelorsWelcome") : td("bachelorsNotAllowed")}</p>
              <p>{hotel.policies.local_ids_allowed ? td("localIdsOk") : td("localIdsNotOk")}</p>
              <p>{hotel.policies.pets_allowed ? td("petsOk") : td("petsNotOk")}</p>
              {hotel.policies.id_proofs.length ? (
                <p>
                  {td("idProofs", {
                    list: hotel.policies.id_proofs.map((p) => t(`idProofs.${p}`)).join(", "),
                  })}
                </p>
              ) : null}
            </div>
            {hotel.policies.rules.length ? (
              <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {hotel.policies.rules.map((r, i) => (
                  <li key={i}>{pickLocalized(r, locale)}</li>
                ))}
              </ul>
            ) : null}
          </section>

          {hotel.foodDining ? (
            <section aria-labelledby="food" className="space-y-3">
              <h2 id="food" className="flex items-center gap-2 text-xl font-bold">
                <Utensils className="size-5" aria-hidden="true" /> {td("food")}
              </h2>
              <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
                {pickLocalized(hotel.foodDining, locale)}
              </p>
            </section>
          ) : null}

          {hotel.lat !== null && hotel.lng !== null ? (
            <section aria-labelledby="location" className="space-y-3">
              <h2 id="location" className="text-xl font-bold">
                {td("location")}
              </h2>
              <HotelMap
                className="h-72 overflow-hidden rounded-2xl border"
                label={td("location")}
                tiles={defaults.map_tiles}
                center={[hotel.lat, hotel.lng]}
                points={[
                  {
                    id: hotel.id,
                    lat: hotel.lat,
                    lng: hotel.lng,
                    label: name,
                    price: null,
                    href: mapsUrl(hotel.lat, hotel.lng),
                  },
                ]}
              />
              {nearby.length ? (
                <>
                  <h3 className="font-semibold">{td("nearby")}</h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {nearby.map(({ area: a, m }) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-sm"
                      >
                        <span>{pickLocalized(a.name, locale)}</span>
                        <span className="text-muted-foreground">
                          {formatDistance(m, (k, v) => t(`card.${k}`, v))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}

          <section aria-labelledby="reviews" className="space-y-3">
            <h2 id="reviews" className="text-xl font-bold">
              {td("reviews")}
            </h2>
            {hotel.ratingAvg !== null && hotel.ratingCount > 0 ? (
              <RatingBadge
                rating={hotel.ratingAvg}
                count={hotel.ratingCount}
                className="flex-row-reverse justify-end"
              />
            ) : null}
            <p className="text-sm text-muted-foreground">{td("reviewsSoon")}</p>
          </section>
        </div>

        <aside id="book" aria-labelledby="book-title" className="scroll-mt-20">
          <div className="sticky top-20 space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 id="book-title" className="text-lg font-bold">
              {td("bookTitle")}
            </h2>
            {offer?.ok && offerPlan && offerRoom ? (
              <>
                <div className="text-sm">
                  <p className="font-semibold">{pickLocalized(offerRoom.name, locale)}</p>
                  <p className="text-muted-foreground">{pickLocalized(offerPlan.name, locale)}</p>
                  <p className="text-muted-foreground">
                    {td("staySummary", {
                      nights,
                      rooms: stay?.rooms ?? 1,
                      guests: (stay?.adults ?? 0) + (stay?.children ?? 0),
                    })}
                  </p>
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                  <dt>{td("roomCharges")}</dt>
                  <dd className="text-right">{formatPaise(offer.roomChargesPaise, locale)}</dd>
                  {offer.extraGuestPaise ? (
                    <>
                      <dt>{td("extraGuests")}</dt>
                      <dd className="text-right">{formatPaise(offer.extraGuestPaise, locale)}</dd>
                    </>
                  ) : null}
                  <dt>{td("taxes")}</dt>
                  <dd className="text-right">{formatPaise(offer.taxPaise, locale)}</dd>
                  <dt className="border-t pt-2 font-bold">{td("total")}</dt>
                  <dd className="border-t pt-2 text-right text-lg font-extrabold">
                    {formatPaise(offer.totalPaise, locale)}
                  </dd>
                </dl>
                {offer.freeCancellation ? (
                  <p className="text-xs text-accent-green">{t("card.freeCancellation")}</p>
                ) : null}
              </>
            ) : stay && offer && !offer.ok ? (
              <p className="text-sm font-semibold text-destructive">{t(`unavailable.${offer.reason}`)}</p>
            ) : fromPrice !== null ? (
              <div>
                <p className="text-xs text-muted-foreground">{t("card.from")}</p>
                <p className="text-2xl font-extrabold">{formatPaise(fromPrice, locale)}</p>
                <p className="text-xs text-muted-foreground">{td("addDatesForPrices")}</p>
              </div>
            ) : null}
            {bookingOpen && offer?.ok && stay ? (
              <Button asChild size="lg" className="w-full">
                <Link
                  href={{
                    pathname: `/hotels/${hotel.slug}/book`,
                    query: {
                      plan: offer.ratePlanId,
                      checkin: stay.checkIn,
                      checkout: stay.checkOut,
                      rooms: String(stay.rooms),
                      adults: String(stay.adults),
                      children: String(stay.children),
                    },
                  }}
                >
                  <CalendarCheck /> {td("reserve")}
                </Link>
              </Button>
            ) : null}
            {whatsapp ? (
              <Button asChild size="lg" variant={bookingOpen ? "outline" : "default"} className="w-full">
                <a
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(enquiry)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle /> {td("bookNow")}
                </a>
              </Button>
            ) : null}
            {business.phone ? (
              <Button asChild variant="outline" className="w-full">
                <a href={`tel:${business.phone.replace(/[^0-9+]/g, "")}`}>
                  <Phone /> {td("call")}
                </a>
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {bookingOpen ? td("bookingNoteOnline") : td("bookingNote")}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
