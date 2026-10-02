import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShopListing } from "@/components/delivery/shop-listing";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.food" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/** Food delivery: store listing with filters in the URL (see components/delivery/shop-listing). */
export default async function FoodPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ShopListing shop="food" locale={locale} raw={await searchParams} />;
}
