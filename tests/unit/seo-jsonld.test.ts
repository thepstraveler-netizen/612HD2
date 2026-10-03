import { describe, expect, it } from "vitest";
import {
  aggregateRating,
  breadcrumbJsonLd,
  hotelJsonLd,
  organizationJsonLd,
  packageJsonLd,
  priceRange,
  serializeJsonLd,
  storeJsonLd,
  taxiServiceJsonLd,
} from "@/lib/seo/jsonld";

const SITE = "https://thepstraveler.vercel.app";

describe("serializeJsonLd", () => {
  it("escapes characters that could break out of the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script> & co\u2028" });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
    expect(out).toContain("\\u003c/script\\u003e");
    // Still valid JSON that round-trips to the original text.
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script> & co\u2028");
  });

  it("drops undefined fields", () => {
    expect(serializeJsonLd({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("aggregateRating", () => {
  it("is only emitted when there is at least one rating", () => {
    expect(aggregateRating(4.5, 0)).toBeUndefined();
    expect(aggregateRating(null, 10)).toBeUndefined();
    expect(aggregateRating(0, 3)).toBeUndefined();
    expect(aggregateRating(4.26, 12)).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.3,
      ratingCount: 12,
      bestRating: 5,
      worstRating: 1,
    });
  });
});

describe("priceRange", () => {
  it("formats a rupee range", () => {
    expect(priceRange([])).toBeUndefined();
    expect(priceRange([250000])).toBe("₹2,500");
    expect(priceRange([450000, 120000, 0])).toBe("₹1,200 – ₹4,500");
  });
});

describe("organizationJsonLd", () => {
  it("builds WebSite, Organization and TravelAgency nodes from the business profile", () => {
    const ld = organizationJsonLd({
      business: { name: "P&S", phone: "+91 90000 00000", email: "a@b.in", address: "Vrindavan" },
      siteUrl: SITE,
      url: `${SITE}/hi`,
      logo: `${SITE}/icons/icon-512.png`,
      locale: "hi",
    });
    const graph = ld["@graph"] as Record<string, unknown>[];
    expect(graph.map((n) => n["@type"])).toEqual(["WebSite", "Organization", "TravelAgency"]);
    expect(graph[0].inLanguage).toBe("hi-IN");
    expect(graph[2]).toMatchObject({
      telephone: "+91 90000 00000",
      address: { "@type": "PostalAddress", streetAddress: "Vrindavan", addressCountry: "IN" },
    });
    // Empty profile fields are omitted, not emitted as "".
    const bare = organizationJsonLd({
      business: { name: "P&S", phone: "", email: "" },
      siteUrl: SITE,
      url: SITE,
      logo: "l",
      locale: "en",
    });
    expect(serializeJsonLd(bare)).not.toContain("telephone");
  });
});

describe("hotelJsonLd", () => {
  const base = {
    name: "Radha Residency",
    url: `${SITE}/hotels/radha`,
    images: ["a", "b", "c", "d", "e", "f"],
    address: "Raman Reti",
    locality: "Raman Reti, Vrindavan",
    lat: 27.57,
    lng: 77.69,
    starRating: 3,
    pricesPaise: [150000, 300000],
    amenities: ["Wi-Fi", "Parking"],
  };

  it("includes address, geo, price range, stars and amenities", () => {
    const ld = hotelJsonLd({ ...base, ratingAvg: 4.4, ratingCount: 8 });
    expect(ld["@type"]).toBe("Hotel");
    expect(ld.image).toHaveLength(5);
    expect(ld.geo).toEqual({ "@type": "GeoCoordinates", latitude: 27.57, longitude: 77.69 });
    expect(ld.priceRange).toBe("₹1,500 – ₹3,000");
    expect(ld.starRating).toEqual({ "@type": "Rating", ratingValue: 3 });
    expect(ld.amenityFeature).toHaveLength(2);
    expect(ld.aggregateRating).toMatchObject({ ratingValue: 4.4, ratingCount: 8 });
  });

  it("omits aggregateRating without reviews and geo without coordinates", () => {
    const ld = hotelJsonLd({ ...base, lat: null, lng: null, ratingAvg: 4.4, ratingCount: 0 });
    expect(ld.aggregateRating).toBeUndefined();
    expect(ld.geo).toBeUndefined();
  });
});

describe("other builders", () => {
  it("TaxiService carries a from-price offer", () => {
    const ld = taxiServiceJsonLd({
      name: "Cabs",
      url: `${SITE}/cabs`,
      providerName: "P&S",
      siteUrl: SITE,
      fromPaise: 99900,
    });
    expect(ld["@type"]).toBe("TaxiService");
    expect(ld.offers).toMatchObject({ price: "999.00", priceCurrency: "INR" });
    expect(
      taxiServiceJsonLd({ name: "Cabs", url: "u", providerName: "P", siteUrl: SITE }).offers,
    ).toBeUndefined();
  });

  it("packages are Product + TouristTrip with offers and a rating only when rated", () => {
    const input = {
      name: "Braj Darshan",
      url: `${SITE}/packages/braj`,
      images: [],
      itinerary: [{ day: 1, title: "Arrive" }],
      fromPaise: 499900,
      providerName: "P&S",
      siteUrl: SITE,
    };
    const rated = packageJsonLd({ ...input, rating: 4.8, ratingCount: 3 });
    expect(rated["@type"]).toEqual(["Product", "TouristTrip"]);
    expect(rated.offers).toMatchObject({ price: "4999.00", priceCurrency: "INR" });
    expect(rated.aggregateRating).toMatchObject({ ratingValue: 4.8, ratingCount: 3 });
    expect(packageJsonLd({ ...input, rating: 4.8, ratingCount: 0 }).aggregateRating).toBeUndefined();
  });

  it("stores map their kind to Restaurant / GroceryStore", () => {
    const common = { name: "S", url: "u", rating: 4, ratingCount: 2, cuisines: ["North Indian"] };
    const restaurant = storeJsonLd({ ...common, kind: "restaurant" });
    expect(restaurant["@type"]).toBe("Restaurant");
    expect(restaurant.servesCuisine).toEqual(["North Indian"]);
    expect(restaurant.aggregateRating).toMatchObject({ ratingCount: 2 });
    const grocery = storeJsonLd({ ...common, kind: "grocery", ratingCount: 0 });
    expect(grocery["@type"]).toBe("GroceryStore");
    expect(grocery.servesCuisine).toBeUndefined();
    expect(grocery.aggregateRating).toBeUndefined();
  });

  it("breadcrumbs are numbered from 1", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", url: `${SITE}/` },
      { name: "Hotels", url: `${SITE}/hotels` },
    ]);
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Hotels", item: `${SITE}/hotels` },
    ]);
  });
});
