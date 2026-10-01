import en from "@/messages/en.json";
import hi from "@/messages/hi.json";
import { SERVICES } from "@/lib/services";
import type { BusinessInfo, CatalogService, HomeSection, NavLink } from "./types";

/**
 * Offline fallback used ONLY when Supabase isn't configured (CI, a first
 * local run). It renders the same baseline content the
 * `content_baseline` migration seeds, so the public site and E2E tests work
 * without a database. With Supabase configured, everything comes from the DB.
 */

type ServiceSlug = (typeof SERVICES)[number]["slug"];
const t = (slug: ServiceSlug, field: "name" | "description") => ({
  en: en.services[slug][field],
  hi: hi.services[slug][field],
});

const NAV_SERVICES: readonly string[] = [
  "travel-hotel-booking",
  "hotel-vendors",
  "bike",
  "rickshaw",
  "car",
  "food",
  "essentials",
  "medicine",
];

export const fallbackServices: CatalogService[] = SERVICES.map((s) => ({
  id: s.slug,
  slug: s.slug,
  kind: s.kind,
  accent: s.accent,
  icon: s.iconName,
  name: t(s.slug, "name"),
  summary: t(s.slug, "description"),
  description: null,
  highlights: [],
  ctaLabel: null,
  heroImage: null,
  showInNav: NAV_SERVICES.includes(s.slug),
}));

export const fallbackHomeSections: HomeSection[] = [
  {
    key: "hero",
    type: "hero",
    title: { en: en.brand.hero, hi: hi.brand.hero },
    subtitle: { en: en.home.heroLead, hi: hi.home.heroLead },
    content: {
      tagline: { en: en.brand.tagline, hi: hi.brand.tagline },
      search_tabs: ["hotels", "cabs", "rides", "packages", "travel"],
    },
  },
  {
    key: "pillars",
    type: "pillars",
    title: null,
    subtitle: null,
    content: {
      items: [
        { icon: "compass", label: { en: en.home.pillars.travel, hi: hi.home.pillars.travel } },
        { icon: "house", label: { en: en.home.pillars.stay, hi: hi.home.pillars.stay } },
        { icon: "car", label: { en: en.home.pillars.local, hi: hi.home.pillars.local } },
        { icon: "heart", label: { en: en.home.pillars.serving, hi: hi.home.pillars.serving } },
      ],
    },
  },
  {
    key: "services",
    type: "services",
    title: { en: en.home.servicesTitle, hi: hi.home.servicesTitle },
    subtitle: { en: en.home.servicesLead, hi: hi.home.servicesLead },
    content: {},
  },
  {
    key: "about",
    type: "about",
    title: { en: en.home.aboutTitle, hi: hi.home.aboutTitle },
    subtitle: null,
    content: { body: { en: en.home.about, hi: hi.home.about } },
  },
  {
    key: "partner-cta",
    type: "partner_cta",
    title: { en: en.home.partnerTitle, hi: hi.home.partnerTitle },
    subtitle: { en: en.home.partnerLead, hi: hi.home.partnerLead },
    content: { cta_label: { en: en.home.ctaPartner, hi: hi.home.ctaPartner }, href: "/partner" },
  },
];

const HEADER: [keyof typeof en.nav, string][] = [
  ["hotels", "/services/hotel-vendors"],
  ["cabs", "/cabs"],
  ["bikes", "/services/bike"],
  ["rickshaw", "/services/rickshaw"],
  ["food", "/services/food"],
  ["essentials", "/services/essentials"],
  ["medicine", "/services/medicine"],
  ["packages", "/services/travel-hotel-booking"],
  ["travel", "/services/travel-agent"],
  ["partner", "/partner"],
];

export const fallbackNavigation: Record<"header" | "footer_company" | "footer_legal", NavLink[]> = {
  header: HEADER.map(([key, href]) => ({ label: { en: en.nav[key], hi: hi.nav[key] }, href })),
  footer_company: [
    { label: { en: en.footer.about, hi: hi.footer.about }, href: "/#about" },
    { label: { en: en.nav.partner, hi: hi.nav.partner }, href: "/partner" },
  ],
  footer_legal: [],
};

export const fallbackBusiness: BusinessInfo = {
  name: en.brand.name,
  phone: "",
  whatsapp: "",
  email: "",
  address: "Vrindavan, Uttar Pradesh, India",
};
