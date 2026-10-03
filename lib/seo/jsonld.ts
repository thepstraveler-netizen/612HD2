/**
 * schema.org JSON-LD builders. Pure functions (no I/O) so pages pass in the
 * data they already loaded and tests can check the output. Undefined fields
 * drop out when serialised.
 */

export type JsonLd = Record<string, unknown>;

const CONTEXT = "https://schema.org";

/**
 * JSON for a `<script type="application/ld+json">`. `<`, `>` and `&` are
 * escaped so admin-entered text can never close the script tag, plus the
 * two line separators JavaScript parsers trip over.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** `AggregateRating` only when there is at least one rating (Google rejects empty ones). */
export function aggregateRating(
  average: number | null | undefined,
  count: number | null | undefined,
): JsonLd | undefined {
  if (average === null || average === undefined || !count || count <= 0) return undefined;
  if (!Number.isFinite(average) || average <= 0) return undefined;
  return {
    "@type": "AggregateRating",
    ratingValue: Math.round(average * 10) / 10,
    ratingCount: count,
    bestRating: 5,
    worstRating: 1,
  };
}

/** Rupees with two decimals, as schema.org `price` expects a plain number string. */
export function paiseToPrice(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** "₹1,200 – ₹4,500" style `priceRange` from paise amounts (null when none). */
export function priceRange(paise: readonly number[]): string | undefined {
  const values = paise.filter((p) => Number.isFinite(p) && p > 0);
  if (!values.length) return undefined;
  const fmt = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}

export type PostalAddressInput = {
  street?: string | null;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string;
};

export function postalAddress(input: PostalAddressInput): JsonLd | undefined {
  if (!input.street && !input.locality) return undefined;
  return {
    "@type": "PostalAddress",
    streetAddress: input.street || undefined,
    addressLocality: input.locality || undefined,
    addressRegion: input.region || undefined,
    postalCode: input.postalCode || undefined,
    addressCountry: input.country ?? "IN",
  };
}

function geo(lat: number | null | undefined, lng: number | null | undefined): JsonLd | undefined {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return undefined;
  return { "@type": "GeoCoordinates", latitude: lat, longitude: lng };
}

const nonEmpty = <T>(list: readonly T[] | undefined): T[] | undefined =>
  list?.length ? [...list] : undefined;

// ---------------------------------------------------------------- business

export type BusinessProfile = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  whatsapp?: string | null;
};

/**
 * Home page graph: the WebSite, the Organization and the TravelAgency (a
 * LocalBusiness) built from the `business.profile` setting.
 */
export function organizationJsonLd(input: {
  business: BusinessProfile;
  siteUrl: string;
  /** Absolute URL of the current locale's home page. */
  url: string;
  logo: string;
  image?: string;
  description?: string;
  locale: string;
  sameAs?: string[];
}): JsonLd {
  const orgId = `${input.siteUrl}/#organization`;
  const telephone = input.business.phone || undefined;
  const email = input.business.email || undefined;
  return {
    "@context": CONTEXT,
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${input.siteUrl}/#website`,
        url: input.url,
        name: input.business.name,
        inLanguage: input.locale === "hi" ? "hi-IN" : "en-IN",
        publisher: { "@id": orgId },
      },
      {
        "@type": "Organization",
        "@id": orgId,
        name: input.business.name,
        url: input.siteUrl,
        logo: input.logo,
        email,
        telephone,
        sameAs: nonEmpty(input.sameAs),
      },
      {
        "@type": "TravelAgency",
        "@id": `${input.siteUrl}/#business`,
        name: input.business.name,
        description: input.description,
        url: input.url,
        image: input.image ?? input.logo,
        logo: input.logo,
        telephone,
        email,
        address: postalAddress({ street: input.business.address }),
        areaServed: { "@type": "City", name: "Vrindavan" },
        parentOrganization: { "@id": orgId },
      },
    ],
  };
}

// ---------------------------------------------------------------- hotel

export type HotelJsonLdInput = {
  name: string;
  url: string;
  description?: string | null;
  images: string[];
  address?: string | null;
  locality?: string | null;
  lat: number | null;
  lng: number | null;
  starRating?: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  /** Active rate-plan base prices (paise per night). */
  pricesPaise: number[];
  amenities: string[];
  checkInTime?: string | null;
  checkOutTime?: string | null;
  telephone?: string | null;
};

export function hotelJsonLd(input: HotelJsonLdInput): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "Hotel",
    "@id": `${input.url}#hotel`,
    name: input.name,
    url: input.url,
    description: input.description || undefined,
    image: nonEmpty(input.images.slice(0, 5)),
    address: postalAddress({ street: input.address, locality: input.locality }),
    geo: geo(input.lat, input.lng),
    telephone: input.telephone || undefined,
    priceRange: priceRange(input.pricesPaise),
    starRating: input.starRating ? { "@type": "Rating", ratingValue: input.starRating } : undefined,
    aggregateRating: aggregateRating(input.ratingAvg, input.ratingCount),
    checkinTime: input.checkInTime || undefined,
    checkoutTime: input.checkOutTime || undefined,
    amenityFeature: nonEmpty(
      input.amenities.map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })),
    ),
  };
}

// ---------------------------------------------------------------- cabs

export function taxiServiceJsonLd(input: {
  name: string;
  description?: string;
  url: string;
  providerName: string;
  siteUrl: string;
  telephone?: string | null;
  /** Lowest advertised fare in paise, if any. */
  fromPaise?: number | null;
}): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "TaxiService",
    name: input.name,
    description: input.description,
    url: input.url,
    serviceType: "Taxi",
    provider: {
      "@type": "TravelAgency",
      "@id": `${input.siteUrl}/#business`,
      name: input.providerName,
      telephone: input.telephone || undefined,
    },
    areaServed: [
      { "@type": "City", name: "Vrindavan" },
      { "@type": "City", name: "Mathura" },
    ],
    offers:
      input.fromPaise !== null && input.fromPaise !== undefined && input.fromPaise > 0
        ? {
            "@type": "Offer",
            price: paiseToPrice(input.fromPaise),
            priceCurrency: "INR",
            availability: "https://schema.org/InStock",
          }
        : undefined,
  };
}

// ---------------------------------------------------------------- packages

export function packageJsonLd(input: {
  name: string;
  url: string;
  description?: string | null;
  images: string[];
  category?: string;
  itinerary: { day: number; title: string }[];
  fromPaise: number | null;
  rating: number | null;
  ratingCount: number;
  providerName: string;
  siteUrl: string;
}): JsonLd {
  return {
    "@context": CONTEXT,
    // Product lets the offer and rating qualify for rich results; TouristTrip says what it is.
    "@type": ["Product", "TouristTrip"],
    "@id": `${input.url}#trip`,
    name: input.name,
    url: input.url,
    description: input.description || undefined,
    image: nonEmpty(input.images.slice(0, 5)),
    category: input.category,
    touristType: input.category,
    brand: { "@type": "Brand", name: input.providerName },
    provider: { "@type": "TravelAgency", "@id": `${input.siteUrl}/#business`, name: input.providerName },
    itinerary: input.itinerary.length
      ? {
          "@type": "ItemList",
          numberOfItems: input.itinerary.length,
          itemListElement: input.itinerary.map((d) => ({
            "@type": "ListItem",
            position: d.day,
            name: d.title,
          })),
        }
      : undefined,
    offers:
      input.fromPaise !== null && input.fromPaise > 0
        ? {
            "@type": "Offer",
            price: paiseToPrice(input.fromPaise),
            priceCurrency: "INR",
            url: input.url,
            availability: "https://schema.org/InStock",
          }
        : undefined,
    aggregateRating: aggregateRating(input.rating, input.ratingCount),
  };
}

// ---------------------------------------------------------------- stores

export function storeJsonLd(input: {
  kind: "restaurant" | "grocery" | "pharmacy";
  name: string;
  url: string;
  description?: string | null;
  image?: string | null;
  address?: string | null;
  telephone?: string | null;
  cuisines?: string[];
  rating: number | null;
  ratingCount: number;
}): JsonLd {
  const type =
    input.kind === "restaurant" ? "Restaurant" : input.kind === "pharmacy" ? "Pharmacy" : "GroceryStore";
  return {
    "@context": CONTEXT,
    "@type": type,
    "@id": `${input.url}#store`,
    name: input.name,
    url: input.url,
    description: input.description || undefined,
    image: input.image || undefined,
    address: postalAddress({ street: input.address, locality: input.address ? undefined : "Vrindavan" }),
    telephone: input.telephone || undefined,
    servesCuisine: input.kind === "restaurant" ? nonEmpty(input.cuisines) : undefined,
    hasMenu: input.kind === "restaurant" ? input.url : undefined,
    aggregateRating: aggregateRating(input.rating, input.ratingCount),
  };
}

// ---------------------------------------------------------------- breadcrumbs

export function breadcrumbJsonLd(items: { name: string; url: string }[]): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
