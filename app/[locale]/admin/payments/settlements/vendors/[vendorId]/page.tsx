import { Download, Handshake, Search } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PaymentSubnav } from "@/components/admin/payment-subnav";
import { AdjustmentForm, CreatePayoutButton } from "@/components/admin/settlement-actions";
import { LedgerTable, NetAmount, SettlementSubnav } from "@/components/admin/settlement-shared";
import { BankDetailsFacts, DetailCard, FactList, dayFormatter } from "@/components/admin/vendor-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { todayInIndia } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";
import { getVendorLedger } from "@/lib/settlements/admin-queries";
import { ledgerQueryString } from "@/lib/settlements/admin-rows";
import { ledgerFiltersSchema } from "@/schemas/vendor-admin";
import { getSettlementsSettings } from "@/lib/settlements/settings";
import { lastCycleEnd, payoutReference } from "@/lib/settlements/statement";

const BASE = "/admin/payments/settlements";

/** One vendor's ledger: every row with its amounts, totals, filters, manual adjustments and CSV. */
export default async function VendorLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendorId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { vendorId } = await params;
  if (!z.uuid().safeParse(vendorId).success) notFound();
  const session = await requirePermission("payments.read", `${BASE}/vendors/${vendorId}`);
  const canAct = hasPermission(session.permissions, "payments.refund");
  const canVendor = hasPermission(session.permissions, "vendors.read");
  const filters = ledgerFiltersSchema.parse(await searchParams);
  const [t, locale, day, ledger, settings] = await Promise.all([
    getTranslations("settlementsAdmin"),
    getLocale(),
    dayFormatter(),
    getVendorLedger(vendorId, filters),
    getSettlementsSettings(),
  ]);
  if (!ledger) notFound();
  const { vendor } = ledger;
  const active = Boolean(filters.from || filters.to || filters.view !== "all");
  const csvHref = `/api/admin/settlements/ledger?${ledgerQueryString(vendorId, filters)}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader title={vendor.name} lead={t("ledger.lead")} backHref={BASE} backLabel={t("title")}>
        <PaymentSubnav active="settlements" />
        <SettlementSubnav active="overview" />
        <div className="flex flex-wrap gap-2">
          {canAct && ledger.unsettled.count > 0 && !ledger.pending ? (
            <CreatePayoutButton
              vendorId={vendor.id}
              vendorName={vendor.name}
              defaultPeriodEnd={lastCycleEnd(todayInIndia(), settings.cycle_days)}
            />
          ) : null}
          <Button asChild variant="outline">
            <a href={csvHref} download>
              <Download /> {t("ledger.csv")}
            </a>
          </Button>
          {canVendor ? (
            <Button asChild variant="ghost">
              <Link href={`/admin/vendors/${vendor.id}`}>
                <Handshake /> {t("ledger.vendorProfile")}
              </Link>
            </Button>
          ) : null}
        </div>
      </AdminPageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <DetailCard title={t("ledger.balance")}>
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t("ledger.unsettledRows", { count: ledger.unsettled.count })}
            </p>
            <NetAmount paise={ledger.unsettled.net_paise} className="text-lg" />
          </div>
          {ledger.pending ? (
            <p className="text-sm">
              {t("ledger.pendingPayout")}{" "}
              <Link href={`${BASE}/payouts/${ledger.pending.id}`} className="font-medium text-primary">
                {payoutReference(ledger.pending.number)} · {formatPaise(ledger.pending.amount_paise, locale)}{" "}
                ({day(ledger.pending.period_end)})
              </Link>
            </p>
          ) : null}
          <FactList
            items={[
              {
                label: t("ledger.commission"),
                value: formatPaise(ledger.unsettled.commission_paise, locale),
              },
              {
                label: t("ledger.commissionTax"),
                value: formatPaise(ledger.unsettled.commission_tax_paise, locale),
              },
            ]}
          />
        </DetailCard>
        <DetailCard title={t("ledger.payTo")}>
          <BankDetailsFacts bank={vendor.bank} full={canAct} />
        </DetailCard>
        {canAct ? (
          <DetailCard title={t("adjustment.title")}>
            <AdjustmentForm vendorId={vendor.id} />
          </DetailCard>
        ) : null}
      </div>

      <form method="get" className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="lf-from">{t("filters.from")}</Label>
          <Input id="lf-from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lf-to">{t("filters.to")}</Label>
          <Input id="lf-to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lf-view">{t("filters.view")}</Label>
          <NativeSelect id="lf-view" name="view" defaultValue={filters.view}>
            <option value="all">{t("filters.all")}</option>
            <option value="unsettled">{t("filters.unsettled")}</option>
            <option value="settled">{t("filters.settled")}</option>
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="submit">
            <Search /> {t("filters.apply")}
          </Button>
          {active ? (
            <Button asChild variant="ghost">
              <Link href={`${BASE}/vendors/${vendorId}`}>{t("filters.clear")}</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <LedgerTable rows={ledger.rows} totals={ledger.totals} />
      <p className="text-xs text-muted-foreground">{t("ledger.formula")}</p>
    </div>
  );
}
