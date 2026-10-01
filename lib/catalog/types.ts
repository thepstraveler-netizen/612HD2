import type { LocalizedJson } from "@/lib/i18n/localized";
import type { Enums, Json } from "@/types/database";

export type CatalogService = {
  id: string;
  slug: string;
  kind: Enums<"service_kind">;
  accent: Enums<"service_accent">;
  icon: string;
  name: LocalizedJson;
  summary: LocalizedJson;
  description: LocalizedJson | null;
  highlights: LocalizedJson[];
  ctaLabel: LocalizedJson | null;
  heroImage: string | null;
  showInNav: boolean;
};

export type HomeSection = {
  key: string;
  type: Enums<"cms_section_type">;
  title: LocalizedJson | null;
  subtitle: LocalizedJson | null;
  content: Json;
};

export type Banner = {
  id: string;
  tab: Enums<"offer_tab">;
  title: LocalizedJson;
  subtitle: LocalizedJson | null;
  couponCode: string | null;
  ctaLabel: LocalizedJson | null;
  href: string | null;
  image: string | null;
  accent: Enums<"service_accent">;
};

export type Testimonial = {
  id: string;
  authorName: string;
  authorPlace: string | null;
  quote: LocalizedJson;
  rating: number;
};

export type Faq = { id: string; question: LocalizedJson; answer: LocalizedJson };

export type NavLink = { label: LocalizedJson; href: string };

export type BusinessInfo = {
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
};
