import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { BookingFiltersForm } from "@/components/admin/booking-filters";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { BOOKINGS_PAGE_SIZE, listAdminBookings } from "@/lib/bookings/admin";
import { bookingFiltersQuery, parseBookingFilters, readSnapshot } from "@/lib/bookings/admin-forms";
import { formatPaise } from "@/lib/money";

/**
 * Bookings, newest first. Filtering and paging run in the database (the
 * table grows without bound); DataTable only renders the current page.
 */
export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("bookings.read", "/admin/bookings");
  const filters = parseBookingFilters(await searchParams);
  const [t, format, locale, { rows, total }] = await Promise.all([
    getTranslations("bookingsAdmin"),
    getFormatter(),
    getLocale(),
    listAdminBookings(filters),
  ]);
  const pages = Math.max(1, Math.ceil(total / BOOKINGS_PAGE_SIZE));
  const day = (iso: string | null) =>
    iso
      ? format.dateTime(new Date(`${iso}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" })
      : "";

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} lead={t("lead")} />
      <BookingFiltersForm filters={filters} />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("filters.results", { count: total })}
      </p>
      <DataTable
        pageSize={BOOKINGS_PAGE_SIZE}
        editHref="/admin/bookings"
        rows={rows.map((b) => ({
          id: b.id,
          code: b.code,
          guest: `${b.contact_name} · ${b.contact_phone}`,
          hotel: readSnapshot(b.snapshot).hotel?.name ?? null,
          dates: b.check_in ? `${day(b.check_in)} → ${day(b.check_out)}` : "",
          total: formatPaise(b.total_paise, locale),
          paid: formatPaise(b.paid_paise, locale),
          status: t(`status.${b.status}`),
          mode: t(`paymentModes.${b.payment_mode}`),
          created: b.created_at,
        }))}
        columns={[
          { key: "code", header: t("columns.code") },
          { key: "guest", header: t("columns.guest") },
          { key: "hotel", header: t("columns.hotel"), kind: "localized" },
          { key: "dates", header: t("columns.dates") },
          { key: "total", header: t("columns.total") },
          { key: "paid", header: t("columns.paid") },
          { key: "status", header: t("columns.status"), kind: "badge" },
          { key: "mode", header: t("columns.mode") },
          { key: "created", header: t("columns.created"), kind: "date" },
        ]}
      />
      {pages > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label={t("pagination.label")}>
          <span className="text-muted-foreground">{t("pagination.page", { page: filters.page, pages })}</span>
          {filters.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/bookings${bookingFiltersQuery(filters, filters.page - 1)}`}>
                {t("pagination.prev")}
              </Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/bookings${bookingFiltersQuery(filters, filters.page + 1)}`}>
                {t("pagination.next")}
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
