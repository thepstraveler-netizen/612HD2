import { Search, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { PACKAGE_BOOKING_MODES, PACKAGE_STATUSES, type PackageFilters } from "@/schemas/package-admin";

/** Package list filters as a plain GET form, so a filtered list is a shareable URL. */
export async function PackageFiltersForm({
  filters,
  categories,
}: {
  filters: PackageFilters;
  categories: string[];
}) {
  const t = await getTranslations("packagesAdmin");
  const active = Boolean(filters.status || filters.mode || filters.category || filters.q);
  return (
    <form method="get" role="search" className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-4">
      <div className="grid gap-1.5">
        <Label htmlFor="pf-q">{t("filters.search")}</Label>
        <Input
          id="pf-q"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder={t("filters.searchPlaceholder")}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pf-status">{t("filters.status")}</Label>
        <NativeSelect id="pf-status" name="status" defaultValue={filters.status ?? ""}>
          <option value="">{t("filters.current")}</option>
          {PACKAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pf-mode">{t("filters.mode")}</Label>
        <NativeSelect id="pf-mode" name="mode" defaultValue={filters.mode ?? ""}>
          <option value="">{t("filters.any")}</option>
          {PACKAGE_BOOKING_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`modes.${m}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pf-category">{t("filters.category")}</Label>
        <NativeSelect id="pf-category" name="category" defaultValue={filters.category ?? ""}>
          <option value="">{t("filters.any")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
        <Button type="submit">
          <Search /> {t("filters.apply")}
        </Button>
        {active ? (
          <Button asChild variant="ghost">
            <Link href="/admin/packages">
              <X /> {t("filters.clear")}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
