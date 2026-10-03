import { Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ToneBadge } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PaymentSubnav } from "@/components/admin/payment-subnav";
import { AdminTable } from "@/components/admin/payment-table";
import { SettlementSubnav } from "@/components/admin/settlement-shared";
import { dayFormatter, whenFormatter } from "@/components/admin/vendor-shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { formatPaise } from "@/lib/money";
import { PAYOUTS_PER_PAGE, listPayouts, vendorOptions } from "@/lib/settlements/admin-queries";
import { payoutStatusTone } from "@/lib/settlements/admin-rows";
import { payoutReference } from "@/lib/settlements/statement";
import { PAYOUT_STATUSES, settlementFiltersSchema } from "@/schemas/settlements";

const BASE = "/admin/payments/settlements";

/** Every payout (all vendors), newest first, filtered by status and vendor. */
export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("payments.read", `${BASE}/payouts`);
  const raw = await searchParams;
  const filters = settlementFiltersSchema.parse({
    vendor: raw.vendor || undefined,
    status: raw.status || undefined,
    page: raw.page,
  });
  const [t, locale, day, when, { rows, total }, vendors] = await Promise.all([
    getTranslations("settlementsAdmin"),
    getLocale(),
    dayFormatter(),
    whenFormatter(),
    listPayouts(filters),
    vendorOptions(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAYOUTS_PER_PAGE));
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (filters.vendor) params.set("vendor", filters.vendor);
    if (filters.status) params.set("status", filters.status);
    params.set("page", String(page));
    return `${BASE}/payouts?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("payouts.title")} lead={t("payouts.lead")}>
        <PaymentSubnav active="settlements" />
        <SettlementSubnav active="payouts" />
      </AdminPageHeader>
      <form method="get" className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pf-status">{t("filters.status")}</Label>
          <NativeSelect id="pf-status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">{t("filters.anyStatus")}</option>
            {PAYOUT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`payoutStatus.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-vendor">{t("filters.vendor")}</Label>
          <NativeSelect id="pf-vendor" name="vendor" defaultValue={filters.vendor ?? ""}>
            <option value="">{t("filters.anyVendor")}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> {t("filters.apply")}
          </Button>
        </div>
      </form>
      <AdminTable
        empty={t("payouts.empty")}
        headers={[
          t("payouts.reference"),
          t("payouts.vendor"),
          t("payouts.periodEnd"),
          t("payouts.entries"),
          <span key="a" className="block text-right">
            {t("payouts.amount")}
          </span>,
          t("payouts.status"),
          t("payouts.createdAt"),
        ]}
        rows={rows.map((p) => ({
          key: p.id,
          cells: [
            <Link key="r" href={`${BASE}/payouts/${p.id}`} className="font-mono font-medium text-primary">
              {payoutReference(p.number)}
            </Link>,
            <Link key="v" href={`${BASE}/vendors/${p.vendor_id}`} className="text-primary">
              {p.vendorName}
            </Link>,
            <span key="d" className="whitespace-nowrap">
              {day(p.period_end)}
            </span>,
            p.entries_count,
            <span key="m" className="block text-right font-semibold whitespace-nowrap">
              {formatPaise(p.amount_paise, locale)}
            </span>,
            <ToneBadge key="s" tone={payoutStatusTone(p.status)} label={t(`payoutStatus.${p.status}`)} />,
            <span key="c" className="whitespace-nowrap">
              {when(p.created_at)}
            </span>,
          ],
        }))}
      />
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">{t("payouts.page", { page: filters.page, pages })}</span>
          {filters.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(filters.page - 1)}>{t("payouts.prev")}</Link>
            </Button>
          ) : null}
          {filters.page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(filters.page + 1)}>{t("payouts.next")}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
