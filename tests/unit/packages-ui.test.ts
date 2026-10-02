import { describe, expect, it } from "vitest";
import { leadSource } from "@/lib/leads/attribution";
import { captureVisit, visitToAttribution } from "@/lib/leads/visit";
import type { Departure, PackageSummary } from "@/lib/packages/types";
import {
  checkoutErrorKind,
  departureRows,
  enquiryPayload,
  filterPackages,
  formatTourDate,
  humanizeSlug,
  packageAction,
  packageCategories,
  packageCheckoutQuery,
  packageLineLabel,
  packageSnapshot,
  parsePackageCheckoutQuery,
  parseTravelMode,
  privateTourMinDate,
  quotePageState,
  quoteSnapshot,
  sortedTiers,
  travellerLimits,
  travelPrefill,
  type EnquiryFormValues,
} from "@/lib/packages/ui";
import { isProtectedPath } from "@/lib/routing/protected";
import { attributionSchema, enquirySchema, packageCheckoutSchema } from "@/schemas/packages";

const pkg = (over: Partial<PackageSummary>): Pick<PackageSummary, "category" | "destinations" | "title"> => ({
  category: "braj",
  destinations: ["Vrindavan"],
  title: { en: "Tour", hi: null },
  ...over,
});

const values = (over: Partial<EnquiryFormValues> = {}): EnquiryFormValues => ({
  startDate: "",
  adults: "2",
  children: "",
  from: "",
  to: "",
  departOn: "",
  returnOn: "",
  travelClass: "",
  name: "Radha Sharma",
  phone: "9876543210",
  email: "",
  message: "",
  website: "",
  ...over,
});

describe("package listing", () => {
  const list = [
    pkg({ category: "braj", destinations: ["Vrindavan", "Govardhan"], title: { en: "Braj 84 Kos Yatra" } }),
    pkg({ category: "heritage", destinations: ["Agra", "Mathura"], title: { en: "Taj and Krishna" } }),
    pkg({
      category: "braj",
      destinations: ["Barsana"],
      title: { en: "Holi in Barsana", hi: "बरसाना की होली" },
    }),
  ];

  it("lists categories once, in catalog order", () => {
    expect(packageCategories(list)).toEqual(["braj", "heritage"]);
  });

  it("filters by category and by every word of the search text", () => {
    expect(filterPackages(list, { category: "braj" })).toHaveLength(2);
    expect(filterPackages(list, { q: "agra" }).map((p) => p.category)).toEqual(["heritage"]);
    expect(filterPackages(list, { q: "braj yatra" })).toHaveLength(1);
    expect(filterPackages(list, { q: "बरसाना" })).toHaveLength(1);
    expect(filterPackages(list, { category: "heritage", q: "barsana" })).toEqual([]);
    expect(filterPackages(list, { category: null, q: "  " })).toHaveLength(3);
  });

  it("offers online booking only for bookable packages while the flag is on", () => {
    expect(packageAction("book", true)).toBe("book");
    expect(packageAction("book", false)).toBe("enquire");
    expect(packageAction("enquiry", true)).toBe("enquire");
  });

  it("humanises unknown category slugs", () => {
    expect(humanizeSlug("char-dham")).toBe("Char dham");
    expect(humanizeSlug("braj")).toBe("Braj");
  });
});

describe("departures and limits", () => {
  const dep = (id: string, startDate: string, seatsLeft: number | null): Departure => ({
    id,
    startDate,
    seatsTotal: seatsLeft === null ? null : 30,
    seatsLeft,
    supplementPaise: 0,
    note: null,
  });

  it("sorts departures and marks closed, sold-out and open ones for the group", () => {
    const rows = departureRows(
      [dep("c", "2026-11-20", 2), dep("a", "2026-10-03", 30), dep("b", "2026-10-10", null)],
      3,
      "2026-10-02",
      2,
    );
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ["a", "closed"],
      ["b", "open"],
      ["c", "sold_out"],
    ]);
  });

  it("starts private tours after the booking cut-off", () => {
    expect(privateTourMinDate("2026-10-02", 2)).toBe("2026-10-04");
    expect(privateTourMinDate("2026-10-02", 0)).toBe("2026-10-02");
  });

  it("caps the group at the package and site limits", () => {
    expect(travellerLimits({ minPax: 2, maxPax: 12 }, 20)).toEqual({ min: 2, max: 12 });
    expect(travellerLimits({ minPax: 2, maxPax: 40 }, 20)).toEqual({ min: 2, max: 20 });
    expect(travellerLimits({ minPax: 10, maxPax: 40 }, 6)).toEqual({ min: 6, max: 6 });
  });

  it("orders tiers by group size", () => {
    const tier = (minPax: number) => ({
      id: String(minPax),
      minPax,
      maxPax: minPax + 1,
      adultPricePaise: 1000,
      childPricePaise: null,
    });
    expect(sortedTiers([tier(6), tier(1), tier(3)]).map((t) => t.minPax)).toEqual([1, 3, 6]);
  });
});

describe("checkout URL", () => {
  it("round-trips the widget's choice and validates with the checkout schema", () => {
    const query = packageCheckoutQuery({
      packageSlug: "demo-braj-84-kos-yatra",
      departureId: "6f1c2c1e-8a1b-4c55-9a51-1f0e3c7a2b10",
      startDate: "2026-10-22",
      adults: 3,
      children: 1,
    });
    const back = parsePackageCheckoutQuery(query);
    expect(back).toEqual({
      packageSlug: "demo-braj-84-kos-yatra",
      departureId: "6f1c2c1e-8a1b-4c55-9a51-1f0e3c7a2b10",
      startDate: "2026-10-22",
      adults: 3,
      children: 1,
    });
    expect(packageCheckoutSchema.safeParse({ ...back, locale: "hi" }).success).toBe(true);
  });

  it("leaves out the departure for private tours and defaults bad numbers", () => {
    expect(
      packageCheckoutQuery({ packageSlug: "x", startDate: "2026-10-22", adults: 2, children: 0 }),
    ).not.toHaveProperty("departure");
    expect(parsePackageCheckoutQuery({ package: ["x", "y"], adults: "lots" })).toMatchObject({
      packageSlug: "x",
      departureId: undefined,
      adults: 2,
      children: 0,
    });
  });

  it("maps price lines to labels and splits fatal from fixable errors", () => {
    expect(packageLineLabel("package:adult")).toBe("adult");
    expect(packageLineLabel("package:child")).toBe("child");
    expect(packageLineLabel("surcharge:departure")).toBe("supplement");
    expect(packageLineLabel("fee:convenience")).toBe("fee");
    expect(packageLineLabel("line:1")).toBeNull();
    for (const e of ["sold_out", "departure_closed", "enquiry_only", "booking_closed", "too_many"])
      expect(checkoutErrorKind(e), e).toBe("fatal");
    for (const e of ["price_changed", "coupon", "payment_mode", "signin", "invalid"])
      expect(checkoutErrorKind(e), e).toBe("retry");
  });
});

describe("travel page", () => {
  it("reads ?mode= deep links and falls back to flights", () => {
    expect(parseTravelMode("train")).toBe("train");
    expect(parseTravelMode(["bus"])).toBe("bus");
    expect(parseTravelMode("ship")).toBe("flight");
    expect(parseTravelMode(undefined)).toBe("flight");
  });

  it("prefills from the home search card and drops bad dates", () => {
    expect(travelPrefill({ from: "Delhi", to: "Mathura", date: "2026-10-12" })).toEqual({
      from: "Delhi",
      to: "Mathura",
      departOn: "2026-10-12",
    });
    expect(travelPrefill({ date: "tomorrow" }).departOn).toBe("");
  });
});

describe("enquiry payloads", () => {
  const extra = { locale: "en" as const, attribution: { utm: { source: "instagram" } } };

  it("builds a valid package enquiry", () => {
    const payload = enquiryPayload(
      { kind: "package", packageSlug: "demo-agra-mathura-vrindavan" },
      values({ startDate: "2026-11-01" }),
      extra,
    );
    const parsed = enquirySchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.kind === "package") {
      expect(parsed.data.children).toBe(0);
      expect(parsed.data.attribution.utm.source).toBe("instagram");
    }
  });

  it("builds a travel enquiry per mode and rejects the same city both ways", () => {
    const target = { kind: "travel" as const, mode: "train" as const };
    const ok = enquiryPayload(
      target,
      values({ from: "Delhi", to: "Mathura", departOn: "2026-10-12", adults: "1", travelClass: "3A" }),
      extra,
    );
    expect(ok.kind).toBe("train");
    expect(enquirySchema.safeParse(ok).success).toBe(true);
    const same = enquiryPayload(
      target,
      values({ from: "Delhi", to: "delhi", departOn: "2026-10-12" }),
      extra,
    );
    const parsed = enquirySchema.safeParse(same);
    expect(parsed.success).toBe(false);
  });

  it("builds a service enquiry and keeps the honeypot for the server to judge", () => {
    const payload = enquiryPayload(
      { kind: "service", serviceSlug: "photography" },
      values({ website: "spam.example" }),
      extra,
    );
    expect(payload).toMatchObject({ kind: "service", serviceSlug: "photography", website: "spam.example" });
    // A filled honeypot fails the schema's max(0); submitEnquiry never sees a real lead from it.
    expect(enquirySchema.safeParse(payload).success).toBe(false);
    expect(enquirySchema.safeParse({ ...payload, website: "" }).success).toBe(true);
  });
});

describe("visit attribution", () => {
  it("captures UTM tags, an outside referrer and the landing page", () => {
    const visit = captureVisit({
      search: "?utm_source=instagram&utm_campaign=holi",
      referrer: "https://l.instagram.com/?u=x",
      pathname: "/packages",
      host: "pstraveler.in",
    });
    expect(visit).toEqual({
      utm: { source: "instagram", campaign: "holi" },
      referrer: "https://l.instagram.com/?u=x",
      landingPath: "/packages?utm_source=instagram&utm_campaign=holi",
    });
    const attribution = attributionSchema.parse(visitToAttribution(JSON.stringify(visit)));
    expect(leadSource(attribution, ["instagram", "whatsapp", "website"])).toBe("instagram");
  });

  it("ignores our own pages as referrers and junk in storage", () => {
    expect(
      captureVisit({
        search: "",
        referrer: "https://pstraveler.in/hotels",
        pathname: "/",
        host: "pstraveler.in",
      }).referrer,
    ).toBeUndefined();
    expect(visitToAttribution(null)).toEqual({ utm: {} });
    expect(visitToAttribution("{not json")).toEqual({ utm: {} });
    expect(visitToAttribution(JSON.stringify({ utm: { source: 5, medium: "social" }, referrer: 1 }))).toEqual(
      {
        utm: { medium: "social" },
      },
    );
  });
});

describe("My Trips and the quote page", () => {
  it("recognises package and quote bookings by their snapshots", () => {
    const pkgSnap = {
      package: {
        slug: "demo-braj-84-kos-yatra",
        title: { en: "Braj 84 Kos Yatra", hi: null },
        days: 7,
        nights: 6,
        destinations: ["Vrindavan"],
        inclusions: [{ en: "AC coach" }],
        startDate: "2026-10-22",
        endDate: "2026-10-28",
        pickupPoint: null,
      },
      trip: { label: "Braj 84 Kos Yatra", route: "Vrindavan", vehicle: "" },
      cancellationPolicy: { en: "Free up to 15 days", hi: null },
    };
    expect(packageSnapshot(pkgSnap)?.package.days).toBe(7);
    expect(quoteSnapshot(pkgSnap)).toBeNull();
    const quote = {
      quote: { id: "q", number: 2, title: "Delhi → Mathura by train", notes: null, terms: "Non-refundable" },
      lead: { id: "l", reference: "LD-00042", kind: "train" },
      trip: { label: "Delhi → Mathura by train", route: "Delhi → Mathura", vehicle: "" },
    };
    expect(quoteSnapshot(quote)?.quote.number).toBe(2);
    expect(packageSnapshot(quote)).toBeNull();
    expect(packageSnapshot({ hotel: { name: { en: "x" } } })).toBeNull();
  });

  it("maps quote statuses to page states", () => {
    expect(quotePageState("sent")).toBe("payable");
    expect(quotePageState("paid")).toBe("paid");
    expect(quotePageState("expired")).toBe("expired");
    expect(quotePageState("cancelled")).toBe("cancelled");
    expect(quotePageState("draft")).toBe("cancelled");
  });

  it("formats calendar dates without a time-zone shift", () => {
    expect(formatTourDate("2026-10-22", "en")).toBe("22 Oct 2026");
    expect(formatTourDate(null, "en")).toBe("");
  });

  it("keeps the quote page and package pages public, the trips page private", () => {
    expect(isProtectedPath("/quote/abc")).toBe(false);
    expect(isProtectedPath("/packages/demo")).toBe(false);
    expect(isProtectedPath("/travel")).toBe(false);
    expect(isProtectedPath("/account/trips/ABC123")).toBe(true);
  });
});
