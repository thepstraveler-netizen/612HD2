import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { PackageFiltersForm } from "@/components/admin/package-filters";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { formatPaise } from "@/lib/money";
import { listAdminPackages, listPackageCategories } from "@/lib/packages/admin";
import { packageStatusTone } from "@/lib/packages/admin-rows";
import { hasPermission } from "@/lib/permissions/check";
import { packageFiltersSchema } from "@/schemas/package-admin";

/** Tour packages with their status, booking mode, from-price, next departure and live bookings. */
export default async function AdminPackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("packages.read", "/admin/packages");
  const canWrite = hasPermission(session.permissions, "packages.write");
  const raw = await searchParams;
  const filters = packageFiltersSchema.parse({
    status: raw.status || undefined,
    mode: raw.mode || undefined,
    category: raw.category || undefined,
    q: typeof raw.q === "string" && raw.q.trim() ? raw.q : undefined,
  });
  const [t, locale, format, packages, categories] = await Promise.all([
    getTranslations("packagesAdmin"),
    getLocale(),
    getFormatter(),
    listAdminPackages(filters),
    listPackageCategories(),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("title")}
        lead={t("lead")}
        newHref={canWrite ? "/admin/packages/new" : undefined}
        newLabel={t("new")}
      />
      <PackageFiltersForm filters={filters} categories={categories} />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("results", { count: packages.length })}
      </p>
      <DataTable
        editHref="/admin/packages"
        editLabel={canWrite ? undefined : t("view")}
        rows={packages.map((p) => ({
          id: p.id,
          title: p.title,
          status: { label: t(`status.${p.status}`), tone: packageStatusTone(p.status) },
          mode: t(`modes.${p.booking_mode}`),
          duration: t("durationShort", { days: p.duration_days, nights: p.duration_nights }),
          from: p.fromPaise === null ? t("noTiers") : formatPaise(p.fromPaise, locale),
          next: p.fixed_departures
            ? p.nextDeparture
              ? format.dateTime(new Date(`${p.nextDeparture}T00:00:00Z`), {
                  dateStyle: "medium",
                  timeZone: "UTC",
                })
              : t("noDepartures")
            : t("anyDate"),
          bookings: p.bookings,
          featured: p.is_featured,
          sort: p.sort_order,
        }))}
        columns={[
          { key: "title", header: t("columns.title"), kind: "localized" },
          { key: "status", header: t("columns.status"), kind: "tone" },
          { key: "mode", header: t("columns.mode"), kind: "badge" },
          { key: "duration", header: t("columns.duration") },
          { key: "from", header: t("columns.from"), sortable: false },
          { key: "next", header: t("columns.next"), sortable: false },
          { key: "bookings", header: t("columns.bookings"), kind: "number" },
          { key: "featured", header: t("columns.featured"), kind: "boolean" },
          { key: "sort", header: t("columns.sort"), kind: "number" },
        ]}
      />
    </div>
  );
}
