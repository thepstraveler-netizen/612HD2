import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { listCategories, listSurcharges } from "@/lib/cabs/admin";
import { multiplierLabel } from "@/lib/cabs/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";
import { hasPermission } from "@/lib/permissions/check";

/** Peak pricing: multipliers on the base fare by date window, weekday, trip type and category. */
export default async function CabSurchargesPage() {
  const session = await requirePermission("cabs.read", "/admin/cabs/surcharges");
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const [t, th, format, locale, surcharges, categories] = await Promise.all([
    getTranslations("cabsAdmin"),
    getTranslations("hotelsAdmin"),
    getFormatter(),
    getLocale(),
    listSurcharges(),
    listCategories(),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, pickLocalized(c.name, locale)]));
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const dateWindow = (start: string | null, end: string | null) =>
    !start && !end ? t("surcharges.always") : `${start ? day(start) : "…"} – ${end ? day(end) : "…"}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("surcharges.title")}
        lead={t("surcharges.lead")}
        newHref={canWrite ? "/admin/cabs/surcharges/new" : undefined}
        newLabel={t("surcharges.new")}
      >
        <CabSubnav active="surcharges" />
      </AdminPageHeader>
      <DataTable
        rows={surcharges.map((s) => ({
          id: s.id,
          name: s.name,
          multiplier: multiplierLabel(s.multiplier_bps),
          dates: dateWindow(s.starts_on, s.ends_on),
          weekdays: s.weekdays.length ? s.weekdays.map((d) => th(`weekdays.${d}`)).join(", ") : th("allDays"),
          tripTypes: s.trip_types.length
            ? s.trip_types.map((v) => t(`tripTypes.${v}`)).join(", ")
            : t("fields.allTripTypes"),
          categories: s.category_ids.length
            ? s.category_ids.map((id) => categoryName.get(id) ?? "?").join(", ")
            : t("fields.allCategories"),
          active: s.is_active,
        }))}
        editHref={canWrite ? "/admin/cabs/surcharges" : undefined}
        columns={[
          { key: "name", header: t("columns.name"), kind: "localized" },
          { key: "multiplier", header: t("surcharges.multiplierShort"), kind: "badge" },
          { key: "dates", header: t("surcharges.dates"), sortable: false },
          { key: "weekdays", header: t("surcharges.weekdays"), sortable: false },
          { key: "tripTypes", header: t("fields.tripTypes"), sortable: false },
          { key: "categories", header: t("fields.categories"), sortable: false },
          { key: "active", header: t("fields.active"), kind: "boolean" },
        ]}
      />
    </div>
  );
}
