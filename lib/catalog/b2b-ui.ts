import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";

/**
 * Pure display helpers for the B2B service pages (plans / pricing cards,
 * portfolio gallery, plan choice in the enquiry form). Data comes from
 * lib/catalog/b2b.ts.
 */

export type ServicePlan = {
  id: string;
  name: LocalizedJson;
  summary: LocalizedJson | null;
  /** null = price on request. */
  pricePaise: number | null;
  priceSuffix: LocalizedJson | null;
  features: LocalizedJson[];
  isPopular: boolean;
};

export type PortfolioItem = {
  id: string;
  title: LocalizedJson;
  caption: LocalizedJson | null;
  clientName: string | null;
  /** https link to a reel, video or live listing. */
  linkUrl: string | null;
  image: { src: string; width: number | null; height: number | null; alt: LocalizedJson | null } | null;
};

/** Window event a "Choose this plan" button sends; the enquiry form on the page listens for it. */
export const CHOOSE_PLAN_EVENT = "pstraveler:choose-plan";
export type ChoosePlanDetail = { planId: string };

/** `₹4,999` or null when the plan is priced on request. */
export function planPrice(pricePaise: number | null, locale: string): string | null {
  return pricePaise === null ? null : formatPaise(pricePaise, locale);
}

/** One line for the plan select: `Listing booster · ₹11,999 per month` (or the name alone). */
export function planOptionLabel(
  plan: Pick<ServicePlan, "name" | "pricePaise" | "priceSuffix">,
  locale: string,
) {
  const name = pickLocalized(plan.name, locale);
  const price = planPrice(plan.pricePaise, locale);
  if (!price) return name;
  const suffix = plan.priceSuffix ? pickLocalized(plan.priceSuffix, locale) : "";
  return `${name} · ${price}${suffix ? ` ${suffix}` : ""}`;
}

/** schema.org `Service` with an `Offer` per priced plan (on-request plans carry no price). */
export function serviceJsonLd(input: {
  name: string;
  description: string;
  providerName?: string | null;
  plans: readonly ServicePlan[];
  locale: string;
}): Record<string, unknown> {
  const offers = input.plans
    .filter((p) => p.pricePaise !== null)
    .map((p) => ({
      "@type": "Offer",
      name: pickLocalized(p.name, input.locale),
      price: ((p.pricePaise ?? 0) / 100).toFixed(2),
      priceCurrency: "INR",
    }));
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description,
    ...(input.providerName ? { provider: { "@type": "Organization", name: input.providerName } } : {}),
    areaServed: "IN",
    ...(offers.length ? { offers } : {}),
  };
}
