import { Search, ShieldCheck } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ToneBadge } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminTable } from "@/components/admin/payment-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { CUSTOMERS_PAGE_SIZE, listCustomers } from "@/lib/customers/queries";
import { customersQuery, parseCustomerFilters } from "@/lib/customers/rows";
import { formatPaise } from "@/lib/money";

/** Admin → Customers: search, filters and paging all run in Postgres (public.admin_customers). */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("customers.read", "/admin/customers");
  const filters = parseCustomerFilters(await searchParams);
  const [t, tPrivacy, locale, format, list] = await Promise.all([
    getTranslations("customersAdmin"),
    getTranslations("privacyAdmin"),
    getLocale(),
    getFormatter(),
    listCustomers(filters),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / CUSTOMERS_PAGE_SIZE));
  const right = (v: string) => <span className="block text-right whitespace-nowrap tabular-nums">{v}</span>;

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} lead={t("lead")}>
        <Button asChild variant="outline">
          <Link href="/admin/customers/privacy">
            <ShieldCheck /> {tPrivacy("title")}
          </Link>
        </Button>
      </AdminPageHeader>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="cf-q">{t("filters.search")}</Label>
          <Input
            id="cf-q"
            name="q"
            type="search"
            defaultValue={filters.q ?? ""}
            placeholder={t("filters.searchPlaceholder")}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-blocked">{t("filters.blocked")}</Label>
          <NativeSelect id="cf-blocked" name="blocked" defaultValue={filters.blocked ?? ""} className="w-40">
            <option value="">{t("filters.any")}</option>
            <option value="no">{t("filters.active")}</option>
            <option value="yes">{t("filters.blockedOnly")}</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-booked">{t("filters.booked")}</Label>
          <NativeSelect id="cf-booked" name="booked" defaultValue={filters.booked ?? ""} className="w-40">
            <option value="">{t("filters.any")}</option>
            <option value="yes">{t("filters.withBookings")}</option>
            <option value="no">{t("filters.noBookings")}</option>
          </NativeSelect>
        </div>
        <Button type="submit">
          <Search /> {t("filters.apply")}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("filters.results", { count: list.total })}
      </p>
      <AdminTable
        empty={t("empty")}
        headers={[
          t("columns.customer"),
          t("columns.phone"),
          <span key="b" className="block text-right">
            {t("columns.bookings")}
          </span>,
          <span key="s" className="block text-right">
            {t("columns.spend")}
          </span>,
          t("columns.lastBooking"),
          t("columns.joined"),
          t("columns.status"),
        ]}
        rows={list.rows.map((c) => ({
          key: c.id,
          cells: [
            <Link key="n" href={`/admin/customers/${c.id}`} className="block min-w-40 text-primary">
              {c.full_name || t("noName")}
              <span className="block text-xs break-all text-muted-foreground">{c.email}</span>
            </Link>,
            <span key="p" className="whitespace-nowrap">
              {c.phone ?? "—"}
            </span>,
            right(String(c.bookings)),
            right(formatPaise(c.spend_paise, locale)),
            <span key="l" className="whitespace-nowrap">
              {c.last_booking_at
                ? format.dateTime(new Date(c.last_booking_at), { dateStyle: "medium" })
                : "—"}
            </span>,
            <span key="j" className="whitespace-nowrap">
              {format.dateTime(new Date(c.created_at), { dateStyle: "medium" })}
            </span>,
            c.is_blocked ? (
              <ToneBadge key="s" tone="danger" label={t("status.blocked")} />
            ) : (
              <ToneBadge key="s" tone="success" label={t("status.active")} />
            ),
          ],
        }))}
      />
      {pages > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label={t("pagination.label")}>
          <span className="text-muted-foreground">{t("pagination.page", { page: filters.page, pages })}</span>
          {filters.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={`/admin/customers${customersQuery(filters, { page: filters.page - 1 })}`}>
                {t("pagination.prev")}
              </Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline">
              <Link href={`/admin/customers${customersQuery(filters, { page: filters.page + 1 })}`}>
                {t("pagination.next")}
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
