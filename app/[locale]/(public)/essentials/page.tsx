import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShopListing } from "@/components/delivery/shop-listing";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.essentials" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/** Essentials delivery: store listing with filters in the URL (see components/delivery/shop-listing). */
export default async function EssentialsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ShopListing shop="essentials" locale={locale} raw={await searchParams} />;
}
