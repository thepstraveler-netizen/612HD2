import { describe, expect, it } from "vitest";
import { pickLocalized } from "@/lib/i18n/localized";
import {
  bannerFormSchema,
  businessProfileSchema,
  faqFormSchema,
  navLinkFormSchema,
  sectionContentSchemas,
  serviceFormSchema,
} from "@/schemas/cms";

const banner = {
  tab: "all",
  title: { en: "Kartik offer", hi: "" },
  subtitle: { en: "", hi: "" },
  coupon_code: "kartik20",
  cta_label: { en: "", hi: "" },
  href: "",
  media_id: null,
  accent: "blue",
  starts_at: "",
  ends_at: "",
  sort_order: "3",
  is_active: true,
};

describe("bannerFormSchema", () => {
  it("normalises raw form values for the database", () => {
    const out = bannerFormSchema.parse(banner);
    expect(out.coupon_code).toBe("KARTIK20");
    expect(out.href).toBeNull();
    expect(out.subtitle).toBeNull();
    expect(out.title).toEqual({ en: "Kartik offer", hi: null });
    expect(out.sort_order).toBe(3);
    expect(out.starts_at).toBeNull();
  });

  it("rejects an end before the start", () => {
    const result = bannerFormSchema.safeParse({
      ...banner,
      starts_at: "2026-11-02T00:00:00.000Z",
      ends_at: "2026-11-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ message: "endBeforeStart", path: ["ends_at"] });
  });

  it("rejects malformed coupon codes and external links", () => {
    expect(bannerFormSchema.safeParse({ ...banner, coupon_code: "x" }).success).toBe(false);
    expect(bannerFormSchema.safeParse({ ...banner, href: "https://evil.example" }).success).toBe(false);
  });
});

describe("serviceFormSchema", () => {
  const service = {
    slug: "car",
    kind: "bookable",
    accent: "red",
    icon: "car",
    name: { en: "Car" },
    summary: { en: "Cabs" },
    sort_order: 1,
    is_published: true,
    show_in_nav: true,
  };
  it("requires English and a clean slug", () => {
    expect(serviceFormSchema.safeParse(service).success).toBe(true);
    expect(serviceFormSchema.safeParse({ ...service, name: { en: "", hi: "कार" } }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ ...service, slug: "Car Rental" }).success).toBe(false);
  });
});

describe("other CMS schemas", () => {
  it("maps the 'general' FAQ option to no service", () => {
    const out = faqFormSchema.parse({
      service_id: "",
      question: { en: "Q" },
      answer: { en: "A" },
      sort_order: 0,
      is_published: true,
    });
    expect(out.service_id).toBeNull();
  });

  it("allows https links only in navigation", () => {
    const link = { menu: "footer_company", label: { en: "Insta" }, sort_order: 0, is_visible: true };
    expect(navLinkFormSchema.safeParse({ ...link, href: "https://instagram.com/x" }).success).toBe(true);
    expect(navLinkFormSchema.safeParse({ ...link, href: "javascript:alert(1)" }).success).toBe(false);
  });

  it("validates section content per type", () => {
    expect(sectionContentSchemas.about.safeParse({ body: { en: "Hi" } }).success).toBe(true);
    expect(sectionContentSchemas.about.safeParse({ body: "Hi" }).success).toBe(false);
    expect(sectionContentSchemas.hero.parse({}).search_tabs).toHaveLength(5);
  });

  it("validates the business profile", () => {
    const profile = {
      name: "P & S",
      phone: "+91 98765 43210",
      whatsapp: "919876543210",
      email: "",
      address: "",
      gstin: "",
    };
    expect(businessProfileSchema.safeParse(profile).success).toBe(true);
    expect(businessProfileSchema.safeParse({ ...profile, gstin: "123" }).success).toBe(false);
  });

  it("falls back to English when Hindi is missing", () => {
    expect(pickLocalized({ en: "Car", hi: null }, "hi")).toBe("Car");
    expect(pickLocalized({ en: "Car", hi: "कार" }, "hi")).toBe("कार");
  });
});
