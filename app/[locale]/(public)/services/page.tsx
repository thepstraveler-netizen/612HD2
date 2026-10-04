import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionTitle } from "@/components/shared/section-title";
import { ServiceCard } from "@/components/shared/service-card";
import { getServices } from "@/lib/catalog/queries";
import { pageMetadata } from "@/lib/seo/metadata";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "servicesIndex" });
  return pageMetadata({ locale, path: "/services", title: t("title"), description: t("lead") });
}

export default async function ServicesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const services = await getServices();
  const groups = [
    {
      key: "bookable",
      title: t("servicesIndex.bookable"),
      items: services.filter((s) => s.kind === "bookable"),
    },
    {
      key: "enquiry",
      title: t("servicesIndex.enquiry"),
      items: services.filter((s) => s.kind === "enquiry"),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 py-10">
      <SectionTitle as="h1" lead={t("servicesIndex.lead")}>
        {t("servicesIndex.title")}
      </SectionTitle>
      {groups.map((group) =>
        group.items.length ? (
          <section key={group.key} aria-labelledby={`group-${group.key}`} className="space-y-4">
            <h2 id={`group-${group.key}`} className="text-xl font-bold">
              {group.title}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {group.items.map((service) => (
                <li key={service.id}>
                  <ServiceCard
                    service={service}
                    locale={locale}
                    cta={service.kind === "bookable" ? t("home.bookable") : t("home.enquiry")}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
