import "server-only";
import { getTranslations } from "next-intl/server";
import type { Store } from "@/lib/delivery/types";
import { SHOP_CONFIG } from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { breadcrumbJsonLd, storeJsonLd, type JsonLd } from "./jsonld";
import { getRatingSummary } from "./queries";
import { absoluteUrl } from "./site";

/** Restaurant / GroceryStore + BreadcrumbList for a store menu page. */
export async function storePageJsonLd(
  store: Store,
  shop: keyof typeof SHOP_CONFIG,
  locale: string,
): Promise<JsonLd[]> {
  const [rating, tSeo, tNav] = await Promise.all([
    getRatingSummary("stores", store.id),
    getTranslations({ locale, namespace: "seo" }),
    getTranslations({ locale, namespace: "nav" }),
  ]);
  const base = SHOP_CONFIG[shop].path;
  const url = absoluteUrl(`${base}/${store.slug}`, locale);
  const name = pickLocalized(store.name, locale);
  return [
    storeJsonLd({
      kind: store.kind,
      name,
      url,
      description: store.description ? pickLocalized(store.description, locale) : null,
      image: store.imageUrl,
      address: store.address,
      cuisines: store.cuisines,
      rating: rating.rating ?? store.rating,
      ratingCount: rating.count,
    }),
    breadcrumbJsonLd([
      { name: tSeo("home"), url: absoluteUrl("/", locale) },
      { name: tNav(shop), url: absoluteUrl(base, locale) },
      { name, url },
    ]),
  ];
}
