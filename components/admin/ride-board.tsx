import { Phone, Search, Star, X } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { formatPaise } from "@/lib/money";
import type { AdminRide, RideLookups } from "@/lib/rides/admin";
import { ridePayment, rideTone } from "@/lib/rides/admin-rows";
import { RIDE_BOARD_GROUPS, RIDE_STATUSES, type RideBoardFilters } from "@/schemas/ride-admin";
import { ToneBadge } from "./booking-status";
import { indiaTime } from "./cab-trip-card";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "Banke Bihari Temple → ISKCON", or "ISKCON · 2 hr" for hourly hire. */
export function rideRouteText(
  ride: Pick<
    AdminRide,
    "mode" | "pickup_point_id" | "pickup_address" | "drop_point_id" | "drop_address" | "hours"
  >,
  lookups: RideLookups,
  t: Translate,
): string {
  const from = (ride.pickup_point_id && lookups.points.get(ride.pickup_point_id)) || ride.pickup_address;
  if (ride.mode === "hourly") return `${from} · ${t("board.hours", { count: ride.hours ?? 1 })}`;
  const to = (ride.drop_point_id && lookups.points.get(ride.drop_point_id)) || ride.drop_address || "–";
  return `${from} → ${to}`;
}

/** "Pay driver · ₹180 due", "Paid online" or "Online · unpaid". */
export function paymentText(booking: AdminRide["booking"], t: Translate, locale: string): string {
  if (!booking) return "–";
  const pay = ridePayment(booking);
  if (pay.kind === "driver") return t("board.payDriver", { amount: formatPaise(pay.duePaise, locale) });
  return pay.paid ? t("board.paidOnline") : t("board.onlineUnpaid");
}

/** One ride on the live board; the whole card opens the ride. */
export async function RideBoardRow({
  ride,
  lookups,
  now,
}: {
  ride: AdminRide;
  lookups: RideLookups;
  now: number;
}) {
  const [t, format, locale] = await Promise.all([
    getTranslations("admin.rides"),
    getFormatter(),
    getLocale(),
  ]);
  const late =
    Date.parse(ride.pickup_at) < now && (ride.status === "requested" || ride.status === "assigned");
  return (
    <li className="relative grid gap-2 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/50">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold">
            <Link href={`/admin/rides/${ride.id}`} className="after:absolute after:inset-0">
              {indiaTime(format, ride.pickup_at)}
            </Link>
            {late ? (
              <span className="ml-2 text-sm font-medium text-destructive">{t("board.late")}</span>
            ) : null}
          </p>
          <p className="text-sm break-words">{rideRouteText(ride, lookups, t)}</p>
        </div>
        <ToneBadge tone={rideTone(ride.status)} label={t(`status.${ride.status}`)} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("board.ride")}</dt>
        <dd>
          <span className="font-mono font-medium">{ride.booking?.code ?? "–"}</span> ·{" "}
          {lookups.types.get(ride.vehicle_type_id) ?? "–"} ·{" "}
          {t("board.passengers", { count: ride.passengers })}
        </dd>
        <dt className="text-muted-foreground">{t("board.customer")}</dt>
        <dd>
          {ride.booking ? (
            <>
              {ride.booking.contact_name} ·{" "}
              <a
                href={`tel:${ride.booking.contact_phone}`}
                className="relative z-10 inline-flex items-center gap-1 text-primary"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                {ride.booking.contact_phone}
              </a>
            </>
          ) : (
            "–"
          )}
        </dd>
        <dt className="text-muted-foreground">{t("board.payment")}</dt>
        <dd>{paymentText(ride.booking, t, locale)}</dd>
        <dt className="text-muted-foreground">{t("board.driver")}</dt>
        <dd>
          {ride.driver_name ? (
            <>
              {ride.driver_name}
              {ride.vehicle_registration ? (
                <span className="text-muted-foreground"> · {ride.vehicle_registration}</span>
              ) : null}
            </>
          ) : (
            <span className="text-accent-amber">{t("board.noDriver")}</span>
          )}
          {ride.rating ? (
            <span className="ml-2 inline-flex items-center gap-0.5 text-muted-foreground">
              <Star className="size-3.5 fill-current" aria-hidden="true" />
              {ride.rating}/5
            </span>
          ) : null}
        </dd>
      </dl>
    </li>
  );
}

/** Board filters as a plain GET form, so a filtered board is a shareable URL. */
export async function RideBoardFiltersForm({ filters }: { filters: RideBoardFilters }) {
  const t = await getTranslations("admin.rides");
  const active = Boolean(filters.status || filters.date);
  return (
    <form
      method="get"
      role="search"
      className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3"
    >
      <div className="col-span-2 grid gap-1.5 sm:col-span-1">
        <Label htmlFor="rb-status">{t("board.filters.status")}</Label>
        <NativeSelect id="rb-status" name="status" defaultValue={filters.status ?? ""}>
          <option value="">{t("board.filters.default")}</option>
          <optgroup label={t("board.filters.groups")}>
            {RIDE_BOARD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {t(`board.groups.${g}`)}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("board.filters.statuses")}>
            {RIDE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </optgroup>
        </NativeSelect>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="rb-date">{t("board.filters.date")}</Label>
        <Input id="rb-date" name="date" type="date" defaultValue={filters.date ?? ""} className="px-2.5" />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button type="submit" className="flex-1 sm:flex-none">
          <Search /> {t("board.filters.apply")}
        </Button>
        {active ? (
          <Button asChild variant="ghost">
            <Link href="/admin/rides">
              <X /> {t("board.filters.clear")}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
