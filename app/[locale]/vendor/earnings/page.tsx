import { CalendarClock, Download, Percent, ReceiptIndianRupee, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VendorNoBusiness } from "@/components/partners/vendor-no-business";
import { VendorSwitcher } from "@/components/partners/vendor-switcher";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { bpsPercent, formatDay, indiaToday, nextCycleEnd, statementColumns } from "@/lib/partners/ui";
import { getPortalContext, getVendorEarnings, type LedgerRow } from "@/lib/partners/vendor-queries";
import { getSettlementsSettings } from "@/lib/settlements/settings";
import { balanceDirection } from "@/lib/settlements/statement";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ v?: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "vendorEarnings" });
  return { title: t("title") };
}

/**
 * What the vendor has earned: the balance not yet settled (who pays whom),
 * the next cut-off, every ledger line and the settlements so far. The
 * settlement settings are staff-only, so they are read on the server with
 * the service role and only the cycle and GST rate are shown.
 */
export default async function VendorEarningsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { v } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("vendorEarnings");
  const portal = await getPortalContext(v);
  if (!portal) return <VendorNoBusiness />;
  const { vendor } = portal;
  const [{ ledger, payouts, unsettled: open, truncated }, settings] = await Promise.all([
    getVendorEarnings(vendor.id),
    getSettlementsSettings(),
  ]);

  const money = (paise: number) => formatPaise(paise, locale);
  const direction = balanceDirection(open.net_paise);
  const cutoff = nextCycleEnd(indiaToday(), settings.cycle_days);
  const cols = statementColumns(ledger);
  const kind = (k: string) => (t.has(`ledger.kinds.${k}`) ? t(`ledger.kinds.${k}`) : k);
  const commission = (r: LedgerRow) => r.commission_paise + r.commission_tax_paise;

  return (
    <div className="space-y-8">
      <VendorSwitcher vendors={portal.vendors} currentId={vendor.id} path="/vendor/earnings" />
      <div className="space-y-1">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {vendor.name} · {t("lead", { days: settings.cycle_days })}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div
          className={cn(
            "rounded-2xl border p-4",
            direction === "pay_vendor" && "border-accent-green/50 bg-accent-green/10",
            direction === "collect" && "border-accent-orange/60 bg-accent-orange/10",
            direction === "settled" && "bg-card",
          )}
        >
          <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Wallet className="size-4" aria-hidden="true" /> {t("balance.title")}
          </dt>
          <dd className="mt-1 space-y-1">
            <span className="block text-2xl font-extrabold" data-testid="vendor-balance">
              {money(open.net_paise)}
            </span>
            <span className="block text-sm">{t(`balance.${direction}`)}</span>
            <span className="block text-xs text-muted-foreground">
              {t("balance.entries", { count: open.count })}
            </span>
          </dd>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4" aria-hidden="true" /> {t("cutoff.title")}
          </dt>
          <dd className="mt-1 space-y-1">
            <span className="block text-2xl font-extrabold">{formatDay(cutoff, locale)}</span>
            <span className="block text-sm text-muted-foreground">{t("cutoff.body")}</span>
          </dd>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Percent className="size-4" aria-hidden="true" /> {t("commission.title")}
          </dt>
          <dd className="mt-1 space-y-1">
            <span className="block text-2xl font-extrabold">
              {t("commission.value", { percent: bpsPercent(vendor.commissionBps) })}
            </span>
            <span className="block text-sm text-muted-foreground">
              {t("commission.body", { tax: bpsPercent(settings.commission_tax_bps) })}
            </span>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="ledger" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="ledger" className="text-lg font-semibold">
            {t("ledger.title")}
          </h2>
          {ledger.length > 0 ? (
            <Button asChild variant="outline">
              <a href={`/api/vendor/statement?v=${vendor.id}`} download>
                <Download aria-hidden="true" /> {t("download")}
              </a>
            </Button>
          ) : null}
        </div>
        {ledger.length === 0 ? (
          <EmptyState
            icon={ReceiptIndianRupee}
            title={t("ledger.empty")}
            description={t("ledger.emptyHelp")}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("netHelp")}</p>
            {truncated ? (
              <p className="text-sm text-muted-foreground">
                {t("ledger.truncated", { count: ledger.length })}
              </p>
            ) : null}

            {/* Phones: one card per line. */}
            <ul className="space-y-3 sm:hidden">
              {ledger.map((r) => (
                <li key={r.id} className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block font-semibold">{r.booking_code ?? kind(r.kind)}</span>
                      <span className="block text-muted-foreground">{formatDay(r.entry_date, locale)}</span>
                    </span>
                    <span className={cn("text-base font-bold", r.net_paise < 0 && "text-destructive")}>
                      {money(r.net_paise)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">{t("ledger.gross")}</dt>
                    <dd className="text-right">{money(r.gross_paise)}</dd>
                    <dt className="text-muted-foreground">{t("ledger.platform")}</dt>
                    <dd className="text-right">{money(r.platform_collected_paise)}</dd>
                    <dt className="text-muted-foreground">{t("ledger.vendor")}</dt>
                    <dd className="text-right">{money(r.vendor_collected_paise)}</dd>
                    <dt className="text-muted-foreground">{t("ledger.commission")}</dt>
                    <dd className="text-right">{money(commission(r))}</dd>
                    {r.tcs_paise ? (
                      <>
                        <dt className="text-muted-foreground">{t("ledger.tcs")}</dt>
                        <dd className="text-right">{money(r.tcs_paise)}</dd>
                      </>
                    ) : null}
                    {r.tds_paise ? (
                      <>
                        <dt className="text-muted-foreground">{t("ledger.tds")}</dt>
                        <dd className="text-right">{money(r.tds_paise)}</dd>
                      </>
                    ) : null}
                    {r.adjustment_paise ? (
                      <>
                        <dt className="text-muted-foreground">{t("ledger.adjustment")}</dt>
                        <dd className="text-right">{money(r.adjustment_paise)}</dd>
                      </>
                    ) : null}
                    <dt className="text-muted-foreground">{t("ledger.payout")}</dt>
                    <dd className="text-right">{r.payout_reference ?? t("ledger.open")}</dd>
                  </dl>
                  {r.note ? <p className="text-muted-foreground">{r.note}</p> : null}
                </li>
              ))}
            </ul>

            {/* Wider screens: the full table. */}
            <div
              className="hidden overflow-x-auto rounded-2xl border bg-card sm:block"
              tabIndex={0}
              role="region"
              aria-labelledby="ledger"
            >
              <table className="w-full text-sm">
                <caption className="sr-only">{t("ledger.caption")}</caption>
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("ledger.date")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("ledger.booking")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t("ledger.gross")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t("ledger.platform")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t("ledger.vendor")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t("ledger.commission")}
                    </th>
                    {cols.tcs ? (
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {t("ledger.tcs")}
                      </th>
                    ) : null}
                    {cols.tds ? (
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {t("ledger.tds")}
                      </th>
                    ) : null}
                    {cols.adjustment ? (
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {t("ledger.adjustment")}
                      </th>
                    ) : null}
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      {t("ledger.net")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("ledger.payout")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ledger.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDay(r.entry_date, locale)}</td>
                      <td className="px-3 py-2">
                        <span className="block font-medium">{r.booking_code ?? kind(r.kind)}</span>
                        {r.note ? (
                          <span className="block text-xs text-muted-foreground">{r.note}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{money(r.gross_paise)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {money(r.platform_collected_paise)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {money(r.vendor_collected_paise)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{money(commission(r))}</td>
                      {cols.tcs ? (
                        <td className="px-3 py-2 text-right whitespace-nowrap">{money(r.tcs_paise)}</td>
                      ) : null}
                      {cols.tds ? (
                        <td className="px-3 py-2 text-right whitespace-nowrap">{money(r.tds_paise)}</td>
                      ) : null}
                      {cols.adjustment ? (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {money(r.adjustment_paise)}
                        </td>
                      ) : null}
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-semibold whitespace-nowrap",
                          r.net_paise < 0 && "text-destructive",
                        )}
                      >
                        {money(r.net_paise)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.payout_reference ?? (
                          <span className="text-muted-foreground">{t("ledger.open")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="payouts" className="space-y-3">
        <h2 id="payouts" className="text-lg font-semibold">
          {t("payouts.title")}
        </h2>
        {payouts.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("payouts.empty")}
          </p>
        ) : (
          <ul className="space-y-3">
            {payouts.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-card p-4 text-sm"
              >
                <div className="space-y-1">
                  <p className="font-semibold">
                    {p.reference}{" "}
                    <span
                      className={cn(
                        "ml-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        p.status === "paid" && "bg-accent-green/15 text-accent-green",
                        p.status === "pending" && "bg-accent-orange/15 text-accent-orange",
                        p.status === "cancelled" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {t(`payouts.statuses.${p.status}`)}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    {t("payouts.periodEnd", { date: formatDay(p.periodEnd, locale) })} ·{" "}
                    {t("balance.entries", { count: p.entries })}
                  </p>
                  {p.status === "paid" && p.paidAt ? (
                    <p className="text-muted-foreground">
                      {t("payouts.paidOn", { date: formatDay(p.paidAt, locale) })}
                      {p.method
                        ? ` · ${t("payouts.method", { method: t(`payouts.methods.${p.method}`) })}`
                        : ""}
                      {p.paymentReference ? ` · ${p.paymentReference}` : ""}
                    </p>
                  ) : null}
                </div>
                <p className={cn("text-lg font-bold", p.amountPaise < 0 && "text-destructive")}>
                  <span className="sr-only">{t("payouts.amount")}: </span>
                  {money(p.amountPaise)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
