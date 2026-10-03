import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VendorBusinessForm } from "@/components/partners/vendor-business-form";
import { VendorDocuments } from "@/components/partners/vendor-documents";
import { VendorNoBusiness } from "@/components/partners/vendor-no-business";
import { VendorSwitcher } from "@/components/partners/vendor-switcher";
import { getPartnersSettings } from "@/lib/partners/settings";
import { bpsPercent, formatDay, indiaToday } from "@/lib/partners/ui";
import { getPortalContext, getVendorDocuments } from "@/lib/partners/vendor-queries";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ v?: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "vendorBusiness" });
  return { title: t("title") };
}

/**
 * The vendor's own business: what staff manage (name, type, status,
 * commission) read-only, the contact, tax and payout details they keep
 * up to date, and their documents.
 */
export default async function VendorBusinessPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { v } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("vendorBusiness");
  const portal = await getPortalContext(v);
  if (!portal) return <VendorNoBusiness />;
  const { vendor } = portal;
  const [documents, settings] = await Promise.all([getVendorDocuments(portal), getPartnersSettings()]);

  const overview: { label: string; value: string; tone?: string }[] = [
    { label: t("overview.name"), value: vendor.name },
    { label: t("overview.kind"), value: t(`kinds.${vendor.kind}`) },
    {
      label: t("overview.status"),
      value: t(`statuses.${vendor.status}`),
      tone:
        vendor.status === "active"
          ? "text-accent-green"
          : vendor.status === "suspended"
            ? "text-destructive"
            : "text-accent-orange",
    },
    {
      label: t("overview.commission"),
      value: t("overview.commissionValue", { percent: bpsPercent(vendor.commissionBps) }),
    },
    {
      label: t("overview.agreement"),
      value:
        vendor.agreementVersion && vendor.agreementAcceptedAt
          ? t("overview.agreementValue", {
              version: vendor.agreementVersion,
              date: formatDay(vendor.agreementAcceptedAt, locale),
            })
          : t("overview.noAgreement"),
    },
  ];

  return (
    <div className="space-y-6">
      <VendorSwitcher vendors={portal.vendors} currentId={vendor.id} path="/vendor/business" />
      <div className="space-y-1">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>
      </div>

      <section aria-labelledby="business-overview" className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 id="business-overview" className="sr-only">
          {t("overview.title")}
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {overview.map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className={cn("font-medium", row.tone)}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <VendorBusinessForm
        key={vendor.id}
        vendorId={vendor.id}
        initial={{
          contactName: vendor.contactName,
          phone: vendor.phone,
          email: vendor.email,
          address: vendor.address,
          city: vendor.city,
          gstin: vendor.gstin,
          pan: vendor.pan,
          bank: vendor.bank,
        }}
      />

      <VendorDocuments
        key={`docs-${vendor.id}`}
        vendorId={vendor.id}
        documents={documents}
        maxMb={settings.max_file_mb}
        locale={locale}
        today={indiaToday()}
      />
    </div>
  );
}
