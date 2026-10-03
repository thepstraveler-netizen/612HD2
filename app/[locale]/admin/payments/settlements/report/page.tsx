import { Download, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PaymentSubnav } from "@/components/admin/payment-subnav";
import { AdminTable } from "@/components/admin/payment-table";
import { SettlementSubnav } from "@/components/admin/settlement-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { todayInIndia } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { getCommissionReport } from "@/lib/settlements/admin-queries";
import { defaultReportRange } from "@/lib/settlements/admin-rows";
import type { LedgerTotals } from "@/lib/settlements/statement";
import { reportRangeSchema } from "@/schemas/vendor-admin";

const BASE = "/admin/payments/settlements";

const COLUMNS = [
  ["gross_paise", "gross"],
  ["commission_paise", "commission"],
  ["commission_tax_paise", "commissionTax"],
  ["tcs_paise", "tcs"],
  ["tds_paise", "tds"],
  ["adjustment_paise", "adjustment"],
  ["net_paise", "net"],
] as const;

/** Commission report: ledger rows dated in a range, totalled per vendor; CSV export. */
export default async function CommissionReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("payments.read", `${BASE}/report`);
  const parsed = reportRangeSchema.parse(await searchParams);
  const fallback = defaultReportRange(todayInIndia());
  let from = parsed.from ?? fallback.from;
  let to = parsed.to ?? fallback.to;
  if (from > to) [from, to] = [to, from];
  const [t, locale, report] = await Promise.all([
    getTranslations("settlementsAdmin"),
    getLocale(),
    getCommissionReport(from, to),
  ]);
  const money = (paise: number) => formatPaise(paise, locale);
  const amounts = (totals: LedgerTotals, bold = false) =>
    COLUMNS.map(([column, key]) => (
      <span key={key} className={`block text-right whitespace-nowrap ${bold ? "font-semibold" : ""}`}>
        {money(totals[column])}
      </span>
    ));

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("report.title")} lead={t("report.lead")}>
        <PaymentSubnav active="settlements" />
        <SettlementSubnav active="report" />
      </AdminPageHeader>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="rf-from">{t("filters.from")}</Label>
          <Input id="rf-from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rf-to">{t("filters.to")}</Label>
          <Input id="rf-to" name="to" type="date" defaultValue={to} />
        </div>
        <Button type="submit">
          <Search /> {t("filters.apply")}
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/admin/settlements/report?from=${from}&to=${to}`} download>
            <Download /> {t("report.csv")}
          </a>
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">{t("report.basis")}</p>
      <AdminTable
        empty={t("report.empty")}
        headers={[
          t("report.vendor"),
          <span key="e" className="block text-right">
            {t("report.entries")}
          </span>,
          ...COLUMNS.map(([, key]) => (
            <span key={key} className="block text-right">
              {t(`ledger.${key}`)}
            </span>
          )),
        ]}
        rows={[
          ...report.rows.map((r) => ({
            key: r.vendorId,
            cells: [
              <Link key="v" href={`${BASE}/vendors/${r.vendorId}?from=${from}&to=${to}`} className="text-primary">
                {r.vendorName}
              </Link>,
              <span key="e" className="block text-right">
                {r.count}
              </span>,
              ...amounts(r),
            ],
          })),
          ...(report.rows.length
            ? [
                {
                  key: "total",
                  cells: [
                    <span key="t" className="font-semibold">
                      {t("report.total")}
                    </span>,
                    <span key="e" className="block text-right font-semibold">
                      {report.totals.count}
                    </span>,
                    ...amounts(report.totals, true),
                  ],
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
