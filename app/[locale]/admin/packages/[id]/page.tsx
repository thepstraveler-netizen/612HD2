import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { DeparturesEditor, ItineraryEditor, TiersEditor } from "@/components/admin/package-editors";
import { PackageForm } from "@/components/admin/package-form";
import { PackageArchiveButton } from "@/components/admin/package-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { todayInIndia } from "@/lib/dates";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { getAdminPackage, type AdminPackage } from "@/lib/packages/admin";
import { archivePackage, restorePackage } from "@/lib/packages/admin-actions";
import { NEW_PACKAGE, packageFormValues, packageStatus, packageStatusTone } from "@/lib/packages/admin-rows";
import { hasPermission } from "@/lib/permissions/check";
import { ToneBadge } from "@/components/admin/booking-status";

const LIST = "/admin/packages";
const SECTIONS = ["details", "photos", "itinerary", "pricing", "departures"] as const;

/** Jump links to the editor's sections (one long page, so it works without JS). */
async function SectionNav() {
  const t = await getTranslations("packagesAdmin.sections");
  return (
    <nav aria-label={t("nav")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {SECTIONS.map((key) => (
        <a
          key={key}
          href={`#${key}`}
          className="inline-flex min-h-10 shrink-0 items-center rounded-full border bg-card px-4 text-sm font-medium hover:bg-accent"
        >
          {t(key)}
        </a>
      ))}
    </nav>
  );
}

/** What agents (packages.read only) see: tiers and departures with seats, no forms. */
async function PackageOverview({ found }: { found: AdminPackage }) {
  const [t, locale, format] = await Promise.all([
    getTranslations("packagesAdmin"),
    getLocale(),
    getFormatter(),
  ]);
  return (
    <div className="grid max-w-4xl gap-6">
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">{t("sections.pricing")}</h2>
        <DataTable
          rows={found.tiers.map((tier) => ({
            id: tier.id,
            group: t("tiers.range", { min: tier.min_pax, max: tier.max_pax }),
            adult: formatPaise(tier.adult_price_paise, locale),
            child:
              tier.child_price_paise === null
                ? t("tiers.sameAsAdult")
                : formatPaise(tier.child_price_paise, locale),
          }))}
          columns={[
            { key: "group", header: t("tiers.group"), sortable: false },
            { key: "adult", header: t("tiers.adultPrice"), sortable: false },
            { key: "child", header: t("tiers.childPrice"), sortable: false },
          ]}
        />
      </section>
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">{t("sections.departures")}</h2>
        <DataTable
          rows={found.departures.map((d) => ({
            id: d.id,
            date: format.dateTime(new Date(`${d.start_date}T00:00:00Z`), {
              dateStyle: "medium",
              timeZone: "UTC",
            }),
            booked: d.booked,
            left: d.left === null ? t("departures.noLimit") : String(d.left),
            supplement: formatPaise(d.supplement_paise, locale),
            active: d.is_active,
          }))}
          columns={[
            { key: "date", header: t("departures.date"), sortable: false },
            { key: "booked", header: t("departures.booked"), kind: "number" },
            { key: "left", header: t("departures.left") },
            { key: "supplement", header: t("departures.supplement") },
            { key: "active", header: t("departures.active"), kind: "boolean" },
          ]}
        />
      </section>
    </div>
  );
}

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  const session = await requirePermission(id ? "packages.read" : "packages.write", `${LIST}/${raw}`);
  const canWrite = hasPermission(session.permissions, "packages.write");
  const [t, locale, found] = await Promise.all([
    getTranslations("packagesAdmin"),
    getLocale(),
    id ? getAdminPackage(id) : null,
  ]);
  if (id && !found) notFound();
  const status = found ? packageStatus(found.pkg) : null;
  const today = todayInIndia();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={found ? pickLocalized(found.pkg.title, locale) : t("newTitle")}
        lead={found ? t("bookingsCount", { count: found.bookings }) : undefined}
        backHref={LIST}
        backLabel={t("title")}
      >
        {found && status ? (
          <div className="flex flex-wrap items-center gap-2">
            <ToneBadge tone={packageStatusTone(status)} label={t(`status.${status}`)} />
            {status === "live" ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/packages/${found.pkg.slug}`} target="_blank">
                  <ExternalLink /> {t("viewOnSite")}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {found && canWrite ? <SectionNav /> : null}
      </AdminPageHeader>
      {found && !canWrite ? (
        <PackageOverview found={found} />
      ) : (
        <>
          <PackageForm
            key={found?.pkg.updated_at ?? "new"}
            defaultValues={found ? packageFormValues(found.pkg) : NEW_PACKAGE}
            imageUrl={found?.imageUrl ?? null}
            gallery={found?.gallery ?? []}
            listHref={LIST}
            extra={
              found ? (
                <PackageArchiveButton
                  id={found.pkg.id}
                  archived={status === "archived"}
                  archive={archivePackage}
                  restore={restorePackage}
                  listHref={LIST}
                />
              ) : undefined
            }
          />
          {found ? (
            <>
              <div id="itinerary" className="max-w-4xl scroll-mt-20">
                <ItineraryEditor pkg={found.pkg} days={found.days} />
              </div>
              <div id="pricing" className="max-w-4xl scroll-mt-20">
                <TiersEditor pkg={found.pkg} tiers={found.tiers} />
              </div>
              <div id="departures" className="max-w-4xl scroll-mt-20">
                <DeparturesEditor pkg={found.pkg} departures={found.departures} today={today} />
              </div>
            </>
          ) : (
            <p className="max-w-4xl text-sm text-muted-foreground">{t("saveFirst")}</p>
          )}
        </>
      )}
    </div>
  );
}
