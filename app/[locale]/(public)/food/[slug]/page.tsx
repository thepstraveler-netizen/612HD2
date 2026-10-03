import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ShopMenuPage } from "@/components/delivery/shop-menu-page";
import { JsonLd } from "@/components/seo/json-ld";
import { getStoreMenu } from "@/lib/delivery/queries";
import { SHOP_CONFIG } from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { pageMetadata } from "@/lib/seo/metadata";
import { storePageJsonLd } from "@/lib/seo/store";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const menu = SLUG.test(slug) ? await getStoreMenu(slug) : null;
  if (!menu || menu.store.kind !== SHOP_CONFIG.food.kind) return {};
  const description = menu.store.description ? pickLocalized(menu.store.description, locale) : undefined;
  return pageMetadata({
    locale,
    path: `${SHOP_CONFIG.food.path}/${menu.store.slug}`,
    title: pickLocalized(menu.store.name, locale),
    description,
    images: menu.store.imageUrl ? [menu.store.imageUrl] : undefined,
  });
}

/** A restaurant's menu: categories, diet filters, item options and the one-store cart. */
export default async function FoodStorePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!SLUG.test(slug)) notFound();
  const menu = await getStoreMenu(slug);
  if (!menu || menu.store.kind !== SHOP_CONFIG.food.kind) notFound();
  const jsonLd = await storePageJsonLd(menu.store, "food", locale);
  return (
    <>
      <JsonLd data={jsonLd} />
      <ShopMenuPage shop="food" menu={menu} locale={locale} raw={await searchParams} />
    </>
  );
}
