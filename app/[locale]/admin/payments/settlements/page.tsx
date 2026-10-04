import { getLocale, getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PaymentSubnav } from "@/components/admin/payment-subnav";
import { AdminTable } from "@/components/admin/payment-table";
import { CreatePayoutButton } from "@/components/admin/settlement-actions";
import { NetAmount, SettlementSubnav } from "@/components/admin/settlement-shared";
import { dayFormatter } from "@/components/admin/vendor-shared";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { todayInIndia } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";
import { settlementOverview } from "@/lib/settlements/admin-queries";
import { getSettlementsSettings } from "@/lib/settlements/settings";
import { lastCycleEnd, payoutReference } from "@/lib/settlements/statement";

const BASE = "/admin/payments/settlements";

/** Who is owed what: one row per vendor with unsettled ledger rows or a payout waiting. */
export default async function SettlementsOverviewPage() {
  const session = await requirePermission("payments.read", BASE);
  const canAct = hasPermission(session.permissions, "payments.refund");
  const [t, locale, day, rows, settings] = await Promise.all([
    getTranslations("settlementsAdmin"),
    getLocale(),
    dayFormatter(),
    settlementOverview(),
    getSettlementsSettings(),
  ]);
  const periodEnd = lastCycleEnd(todayInIndia(), settings.cycle_days);

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} lead={t("lead")}>
        <PaymentSubnav active="settlements" />
        <SettlementSubnav active="overview" />
      </AdminPageHeader>
      <p className="text-sm text-muted-foreground">
        {t("overview.cycle", { days: settings.cycle_days, date: day(periodEnd) })}
      </p>
      <AdminTable
        wide={[5]}
        empty={t("overview.empty")}
        headers={[
          t("overview.vendor"),
          <span key="n" className="block text-right">
            {t("overview.unsettled")}
          </span>,
          t("overview.count"),
          t("overview.oldest"),
          t("overview.pending"),
          <span key="a" className="sr-only">
            {t("overview.actions")}
          </span>,
        ]}
        rows={rows.map((r) => ({
          key: r.vendorId,
          cells: [
            <Link key="v" href={`${BASE}/vendors/${r.vendorId}`} className="font-medium text-primary">
              {r.vendor?.name ?? r.vendorId}
            </Link>,
            <div key="n" className="text-right">
              {r.count ? <NetAmount paise={r.netPaise} /> : "–"}
            </div>,
            r.count,
            r.oldest ? <span className="whitespace-nowrap">{day(r.oldest)}</span> : "–",
            r.pending ? (
              <Link
                key="p"
                href={`${BASE}/payouts/${r.pending.id}`}
                className="whitespace-nowrap text-primary"
              >
                {payoutReference(r.pending.number)} · {formatPaise(r.pending.amount_paise, locale)}
              </Link>
            ) : (
              "–"
            ),
            canAct && r.count > 0 && !r.pending ? (
              <CreatePayoutButton
                key="c"
                size="sm"
                vendorId={r.vendorId}
                vendorName={r.vendor?.name ?? ""}
                defaultPeriodEnd={periodEnd}
              />
            ) : null,
          ],
        }))}
      />
    </div>
  );
}
