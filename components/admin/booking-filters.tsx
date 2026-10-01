import { Search, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { BOOKING_STATUSES } from "@/lib/bookings/state";
import { BOOKING_SERVICES, type BookingFilters } from "@/schemas/booking-admin";

/**
 * Bookings list filters as a plain GET form: the filters live in the URL,
 * so a filtered list can be bookmarked or shared and works without JS.
 */
export async function BookingFiltersForm({ filters }: { filters: BookingFilters }) {
  const t = await getTranslations("bookingsAdmin");
  const active = Boolean(filters.status || filters.service || filters.from || filters.to || filters.q);
  return (
    <form
      method="get"
      role="search"
      className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="bf-q">{t("filters.search")}</Label>
        <Input
          id="bf-q"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder={t("filters.searchPlaceholder")}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bf-status">{t("filters.status")}</Label>
        <NativeSelect id="bf-status" name="status" defaultValue={filters.status ?? ""}>
          <option value="">{t("filters.any")}</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bf-service">{t("filters.service")}</Label>
        <NativeSelect id="bf-service" name="service" defaultValue={filters.service ?? ""}>
          <option value="">{t("filters.any")}</option>
          {BOOKING_SERVICES.map((s) => (
            <option key={s} value={s}>
              {t(`services.${s}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bf-from">{t("filters.from")}</Label>
        <Input id="bf-from" name="from" type="date" defaultValue={filters.from ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bf-to">{t("filters.to")}</Label>
        <Input id="bf-to" name="to" type="date" defaultValue={filters.to ?? ""} />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
        <Button type="submit">
          <Search /> {t("filters.apply")}
        </Button>
        {active ? (
          <Button asChild variant="ghost">
            <Link href="/admin/bookings">
              <X /> {t("filters.clear")}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
