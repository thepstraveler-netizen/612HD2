import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ShopMenuPage } from "@/components/delivery/shop-menu-page";
import { getStoreMenu } from "@/lib/delivery/queries";
import { SHOP_CONFIG } from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const menu = SLUG.test(slug) ? await getStoreMenu(slug) : null;
  if (!menu || menu.store.kind !== SHOP_CONFIG.essentials.kind) return {};
  const description = menu.store.description ? pickLocalized(menu.store.description, locale) : undefined;
  return { title: pickLocalized(menu.store.name, locale), description };
}

/** A shop's menu: categories, diet filters, item options and the one-store cart. */
export default async function EssentialsStorePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!SLUG.test(slug)) notFound();
  const menu = await getStoreMenu(slug);
  if (!menu || menu.store.kind !== SHOP_CONFIG.essentials.kind) notFound();
  return <ShopMenuPage shop="essentials" menu={menu} locale={locale} raw={await searchParams} />;
}
