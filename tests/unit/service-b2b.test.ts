import { describe, expect, it } from "vitest";
import { planOptionLabel, planPrice, serviceJsonLd, type ServicePlan } from "@/lib/catalog/b2b-ui";
import { summarizeLead } from "@/lib/leads/status";
import { leadPlanFact } from "@/lib/leads/ui";
import { rupeesToPaise } from "@/lib/money";
import { enquiryPayload, type EnquiryFormValues } from "@/lib/packages/ui";
import { serviceEnquirySchema } from "@/schemas/packages";
import {
  featuresToLines,
  MAX_PLAN_FEATURES,
  newServicePlanValues,
  nextSortOrder,
  parseFeatureLines,
  servicePlanFormSchema,
  servicePlanFormValues,
  servicePortfolioFormSchema,
  type ServicePlanFormInput,
} from "@/schemas/service-b2b";

const SERVICE = "6f1c2a7e-3b0d-4c55-9a51-0c0f6a1b2c3d";
const PLAN = "0b6c9a7e-1d2f-4e3a-8b5c-6d7e8f9a0b1c";
const MEDIA = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";

const planInput = (over: Partial<ServicePlanFormInput> = {}): ServicePlanFormInput => ({
  ...newServicePlanValues(SERVICE, []),
  name: { en: "Listing booster", hi: "लिस्टिंग बूस्टर" },
  ...over,
});

const plan = (over: Partial<ServicePlan> = {}): ServicePlan => ({
  id: PLAN,
  name: { en: "OTA management", hi: "OTA प्रबंधन" },
  summary: null,
  pricePaise: 799900,
  priceSuffix: { en: "per month", hi: "प्रति माह" },
  features: [],
  isPopular: false,
  ...over,
});

describe("plan prices (rupees → paise)", () => {
  it("stores typed rupees as integer paise and empty as on request", () => {
    expect(rupeesToPaise("4,999")).toBe(499900);
    const priced = servicePlanFormSchema.parse(planInput({ price: "1499.50" }));
    expect(priced.price_paise).toBe(149950);
    const onRequest = servicePlanFormSchema.parse(planInput({ price: "" }));
    expect(onRequest.price_paise).toBeNull();
  });

  it("rejects amounts that aren't rupees", () => {
    for (const price of ["12.345", "-5", "abc"]) {
      const result = servicePlanFormSchema.safeParse(planInput({ price }));
      expect(result.success, price).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toBe("invalidAmount");
    }
  });

  it("round-trips a stored plan into the form and back", () => {
    const row = {
      id: PLAN,
      service_id: SERVICE,
      name: { en: "Booking desk", hi: "बुकिंग डेस्क" },
      summary: null,
      price_paise: 999950,
      price_suffix: { en: "per month", hi: null },
      features: [
        { en: "Daily call report", hi: null },
        { en: "Follow-up calls", hi: "फ़ॉलो-अप कॉल" },
      ],
      is_popular: true,
      sort_order: 20,
      is_published: false,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };
    const values = servicePlanFormValues(row);
    expect(values.price).toBe("9999.50");
    expect(values.features_hi).toBe("\nफ़ॉलो-अप कॉल");
    const parsed = servicePlanFormSchema.parse(values);
    expect(parsed).toMatchObject({
      id: PLAN,
      price_paise: 999950,
      summary: null,
      price_suffix: { en: "per month", hi: null },
      features: row.features,
      is_popular: true,
      is_published: false,
    });
    expect(parsed).not.toHaveProperty("features_en");
  });
});

describe("plan features (one per line)", () => {
  it("pairs English and Hindi lines and skips blank rows", () => {
    expect(
      parseFeatureLines("25 photos\n\n Delivery in 5 days \n\n", "25 फ़ोटो\n\n5 दिन में डिलीवरी"),
    ).toEqual({
      ok: true,
      features: [
        { en: "25 photos", hi: "25 फ़ोटो" },
        { en: "Delivery in 5 days", hi: "5 दिन में डिलीवरी" },
      ],
    });
    expect(parseFeatureLines("Only English", "")).toEqual({
      ok: true,
      features: [{ en: "Only English", hi: null }],
    });
    expect(parseFeatureLines("", "")).toEqual({ ok: true, features: [] });
  });

  it("needs the English line for every Hindi one", () => {
    expect(parseFeatureLines("One", "एक\nदो")).toEqual({ ok: false, problem: "hindiWithoutEnglish" });
    const result = servicePlanFormSchema.safeParse(planInput({ features_en: "One", features_hi: "एक\nदो" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({ message: "hindiWithoutEnglish", path: ["features_hi"] });
    }
  });

  it("limits the number and length of features", () => {
    const many = Array.from({ length: MAX_PLAN_FEATURES + 1 }, (_, i) => `Feature ${i}`).join("\n");
    expect(parseFeatureLines(many, "")).toEqual({ ok: false, problem: "tooManyFeatures" });
    expect(parseFeatureLines("x".repeat(201), "")).toEqual({ ok: false, problem: "featureTooLong" });
  });

  it("writes the list back with Hindi lines aligned", () => {
    expect(featuresToLines([{ en: "A", hi: "अ" }, { en: "B" }, { en: "C", hi: "स" }])).toEqual({
      en: "A\nB\nC",
      hi: "अ\n\nस",
    });
    expect(featuresToLines([{ en: "A", hi: null }])).toEqual({ en: "A", hi: "" });
  });
});

describe("plan display", () => {
  it("formats the price or says it's on request", () => {
    expect(planPrice(499900, "en")).toBe("₹4,999");
    expect(planPrice(149950, "en")).toBe("₹1,499.50");
    expect(planPrice(null, "en")).toBeNull();
  });

  it("labels the plan select with the price and suffix in the page language", () => {
    expect(planOptionLabel(plan(), "en")).toBe("OTA management · ₹7,999 per month");
    expect(planOptionLabel(plan(), "hi")).toMatch(/^OTA प्रबंधन · .+ प्रति माह$/);
    expect(planOptionLabel(plan({ pricePaise: null }), "en")).toBe("OTA management");
    expect(planOptionLabel(plan({ priceSuffix: null }), "en")).toBe("OTA management · ₹7,999");
  });

  it("builds Service JSON-LD with an Offer only for priced plans", () => {
    const ld = serviceJsonLd({
      name: "OTA handling",
      description: "We run your listings",
      providerName: "P&S Traveler",
      plans: [plan(), plan({ id: "x", pricePaise: null })],
      locale: "en",
    });
    expect(ld).toMatchObject({
      "@type": "Service",
      provider: { name: "P&S Traveler" },
      offers: [{ "@type": "Offer", name: "OTA management", price: "7999.00", priceCurrency: "INR" }],
    });
    const none = serviceJsonLd({
      name: "X",
      description: "",
      plans: [plan({ pricePaise: null })],
      locale: "en",
    });
    expect(none).not.toHaveProperty("offers");
  });

  it("places new rows after the existing ones", () => {
    expect(nextSortOrder([])).toBe(10);
    expect(nextSortOrder([{ sort_order: 5 }, { sort_order: 30 }])).toBe(40);
  });
});

describe("portfolio items", () => {
  const base = {
    service_id: SERVICE,
    media_id: null,
    title: { en: "Lobby reel", hi: "" },
    caption: { en: "", hi: "" },
    client_name: " Hotel Radha ",
    link_url: "https://www.instagram.com/reel/abc",
    sort_order: 10,
    is_published: true,
  };

  it("accepts a link-only item and trims optional fields to null", () => {
    expect(servicePortfolioFormSchema.parse(base)).toMatchObject({
      media_id: null,
      title: { en: "Lobby reel", hi: null },
      caption: null,
      client_name: "Hotel Radha",
      link_url: "https://www.instagram.com/reel/abc",
    });
  });

  it("needs a photo or a link, and links must be https", () => {
    const empty = servicePortfolioFormSchema.safeParse({ ...base, link_url: "" });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0]?.message).toBe("needImageOrLink");
    expect(servicePortfolioFormSchema.safeParse({ ...base, link_url: "", media_id: MEDIA }).success).toBe(
      true,
    );
    for (const link_url of ["http://example.com", "javascript:alert(1)", "https://"]) {
      const result = servicePortfolioFormSchema.safeParse({ ...base, link_url, media_id: MEDIA });
      expect(result.success, link_url).toBe(false);
    }
  });
});

describe("plans in enquiries and leads", () => {
  const values: EnquiryFormValues = {
    startDate: "",
    adults: "2",
    children: "0",
    from: "",
    to: "",
    departOn: "",
    returnOn: "",
    travelClass: "",
    name: "Asha",
    phone: "9876543210",
    email: "",
    message: "",
    website: "",
  };

  it("sends the chosen plan with a service enquiry (or none)", () => {
    const target = { kind: "service" as const, serviceSlug: "ota-handling" };
    const chosen = serviceEnquirySchema.parse(
      enquiryPayload(target, { ...values, planId: PLAN }, { locale: "en", attribution: {} }),
    );
    expect(chosen.planId).toBe(PLAN);
    const none = serviceEnquirySchema.parse(
      enquiryPayload(target, values, { locale: "en", attribution: {} }),
    );
    expect(none.planId).toBe("");
  });

  it("shows the plan in the lead summary and facts", () => {
    expect(
      summarizeLead({
        kind: "service",
        details: { plan: "Reels starter" },
        serviceName: "Instagram marketing",
      }),
    ).toBe("Instagram marketing · Reels starter");
    expect(leadPlanFact({ plan: "Reels starter", plan_price_paise: 699900 })).toEqual({
      name: "Reels starter",
      pricePaise: 699900,
    });
    expect(leadPlanFact({ plan: "Leads package", plan_price_paise: null })).toEqual({
      name: "Leads package",
      pricePaise: null,
    });
    expect(leadPlanFact({})).toBeNull();
  });
});
