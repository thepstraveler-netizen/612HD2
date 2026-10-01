import { getLocale, getTranslations } from "next-intl/server";
import { FareGrid } from "@/components/admin/cab-fare-grid";
import { CabSubnav } from "@/components/admin/cab-subnav";
import { AdminPageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { requirePermission } from "@/lib/auth/guards";
import { listCategories, listFareRules } from "@/lib/cabs/admin";
import { fareGridValues } from "@/lib/cabs/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";

/** Per-km outstation fares; editable as one grid by cabs.write staff, a table for readers. */
export default async function CabFaresPage() {
  const session = await requirePermission("cabs.read", "/admin/cabs/fares");
  const canWrite = hasPermission(session.permissions, "cabs.write");
  const [t, locale, categories, rules] = await Promise.all([
    getTranslations("cabsAdmin"),
    getLocale(),
    listCategories(),
    listFareRules(),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("fares.title")} lead={t("fares.lead")}>
        <CabSubnav active="fares" />
      </AdminPageHeader>
      {categories.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">
          {t("fares.noCategories")}
        </p>
      ) : canWrite ? (
        <FareGrid
          defaultValues={fareGridValues(categories, rules)}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
      ) : (
        <DataTable
          rows={rules.map((r) => ({
            id: r.id,
            category: pickLocalized(categoryName.get(r.category_id), locale),
            type: t(`tripTypes.${r.trip_type}`),
            rate: formatPaise(r.rate_per_km_paise, locale),
            min: r.trip_type === "one_way" ? `${r.min_km} km` : `${r.min_km_per_day} km`,
            allowance: formatPaise(r.driver_allowance_per_day_paise, locale),
            night: formatPaise(r.night_charge_paise, locale),
            active: r.is_active,
          }))}
          columns={[
            { key: "category", header: t("fares.category") },
            { key: "type", header: t("fields.tripType") },
            { key: "rate", header: t("fares.ratePerKm"), sortable: false },
            { key: "min", header: t("fares.minimum"), sortable: false },
            { key: "allowance", header: t("fares.allowance"), sortable: false },
            { key: "night", header: t("fares.nightCharge"), sortable: false },
            { key: "active", header: t("fields.active"), kind: "boolean" },
          ]}
        />
      )}
    </div>
  );
}
