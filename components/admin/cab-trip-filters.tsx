import { Search, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { TRIP_STATUSES, type TripFilters } from "@/schemas/cab-admin";

/** Trips list filters as a plain GET form, so a filtered list is a shareable URL. */
export async function TripFiltersForm({ filters }: { filters: TripFilters }) {
  const t = await getTranslations("cabsAdmin");
  const active = Boolean(filters.status || filters.from || filters.to);
  return (
    <form method="get" role="search" className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
      <div className="grid gap-1.5">
        <Label htmlFor="tf-status">{t("trips.filters.status")}</Label>
        <NativeSelect id="tf-status" name="status" defaultValue={filters.status ?? ""}>
          <option value="">{t("trips.filters.any")}</option>
          {TRIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tf-from">{t("trips.filters.from")}</Label>
        <Input id="tf-from" name="from" type="date" defaultValue={filters.from ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tf-to">{t("trips.filters.to")}</Label>
        <Input id="tf-to" name="to" type="date" defaultValue={filters.to ?? ""} />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Button type="submit">
          <Search /> {t("trips.filters.apply")}
        </Button>
        {active ? (
          <Button asChild variant="ghost">
            <Link href="/admin/cabs/trips">
              <X /> {t("trips.filters.clear")}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
