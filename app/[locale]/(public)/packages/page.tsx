import { Map as MapIcon, MessageCircle, Plane } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PackageCard } from "@/components/packages/package-card";
import { PackageFilter, type FilterItem } from "@/components/packages/package-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { TempleSkyline } from "@/components/shared/motifs";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getFeatureFlag } from "@/lib/bookings/settings";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { PACKAGE_FLAG } from "@/lib/packages/checkout";
import { getPackages } from "@/lib/packages/queries";
import { humanizeSlug, packageCategories } from "@/lib/packages/ui";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "packages.listing" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * Tour packages. A cached page over the cached catalog (admin saves clear
 * the `catalog` tag); the category chips filter in the browser.
 */
export default async function PackagesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("packages");
  const [packages, bookingOpen, business] = await Promise.all([
    getPackages(),
    getFeatureFlag(PACKAGE_FLAG),
    getBusinessInfo(),
  ]);
  const categoryLabel = (key: string) =>
    t.has(`categories.${key}`) ? t(`categories.${key}`) : humanizeSlug(key);
  const categories = packageCategories(packages).map((key) => ({ key, label: categoryLabel(key) }));
  const whatsapp = business.whatsapp.replace(/[^0-9]/g, "");

  const items: FilterItem[] = packages.map((pkg, i) => ({
    id: pkg.id,
    category: pkg.category,
    title: pkg.title,
    destinations: pkg.destinations,
    node: (
      <PackageCard
        pkg={pkg}
        locale={locale}
        bookingOpen={bookingOpen}
        categoryLabel={categoryLabel(pkg.category)}
        priority={i < 2}
      />
    ),
  }));

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-sky to-background pb-14">
        <div className="mx-auto max-w-6xl space-y-4 px-4 pt-8 sm:pt-12">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-medium text-primary shadow-sm">
            <MapIcon className="size-4" aria-hidden="true" /> {t("listing.eyebrow")}
          </p>
          <h1 className="text-[length:var(--text-display)] leading-tight font-extrabold tracking-tight">
            {t("listing.title")}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">{t("listing.subtitle")}</p>
        </div>
        <TempleSkyline className="absolute bottom-0 h-12 text-brand-navy/10 dark:text-white/5" />
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        <PackageFilter
          categories={categories}
          items={items}
          empty={
            <EmptyState
              icon={MapIcon}
              title={t("listing.emptyTitle")}
              description={t("listing.emptyBody")}
              action={
                whatsapp ? (
                  <Button asChild variant="outline">
                    <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
                      <MessageCircle /> {t("listing.whatsapp")}
                    </a>
                  </Button>
                ) : undefined
              }
            />
          }
        />

        <section
          aria-labelledby="custom-tour"
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5"
        >
          <div className="space-y-1">
            <h2 id="custom-tour" className="text-lg font-bold">
              {t("listing.customTitle")}
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground">{t("listing.customBody")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {whatsapp ? (
              <Button asChild>
                <a
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t("listing.customWhatsappText"))}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle /> {t("listing.whatsapp")}
                </a>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/travel">
                <Plane /> {t("listing.travelCta")}
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
