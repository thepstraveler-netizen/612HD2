import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatPaise } from "@/lib/money";
import type { LedgerRow } from "@/lib/settlements/admin-queries";
import { balanceDirection, payoutReference, type LedgerTotals } from "@/lib/settlements/statement";
import { cn } from "@/lib/utils";
import { AdminSubnav } from "./page-header";
import { dayFormatter } from "./vendor-shared";

export const SETTLEMENT_AREAS = ["overview", "payouts", "report"] as const;
export type SettlementArea = (typeof SETTLEMENT_AREAS)[number];

const BASE = "/admin/payments/settlements";

/** Overview | Payouts | Commission report. */
export async function SettlementSubnav({ active }: { active: SettlementArea }) {
  const t = await getTranslations("settlementsAdmin.nav");
  return (
    <AdminSubnav
      active={active}
      items={SETTLEMENT_AREAS.map((key) => ({
        key,
        href: key === "overview" ? BASE : `${BASE}/${key}`,
        label: t(key),
      }))}
    />
  );
}

/** A net amount with who owes whom ("Pay vendor" / "Collect"). */
export async function NetAmount({ paise, className }: { paise: number; className?: string }) {
  const [t, locale] = await Promise.all([getTranslations("settlementsAdmin.direction"), getLocale()]);
  const direction = balanceDirection(paise);
  return (
    <span className={cn("inline-flex flex-col items-end whitespace-nowrap", className)}>
      <span
        className={cn(
          "font-semibold",
          direction === "pay_vendor" && "text-accent-green",
          direction === "collect" && "text-destructive",
        )}
      >
        {formatPaise(Math.abs(paise), locale)}
      </span>
      <span className="text-xs text-muted-foreground">{t(direction)}</span>
    </span>
  );
}

const AMOUNT_KEYS = [
  ["gross_paise", "gross"],
  ["platform_collected_paise", "platform"],
  ["vendor_collected_paise", "vendorCollected"],
  ["commission_paise", "commission"],
  ["commission_tax_paise", "commissionTax"],
  ["tcs_paise", "tcs"],
  ["tds_paise", "tds"],
  ["adjustment_paise", "adjustment"],
] as const;

/** Ledger rows with every amount column, a totals footer and links to bookings and payouts. */
export async function LedgerTable({
  rows,
  totals,
  showPayout = true,
}: {
  rows: LedgerRow[];
  totals: LedgerTotals;
  showPayout?: boolean;
}) {
  const [t, locale, day] = await Promise.all([
    getTranslations("settlementsAdmin.ledger"),
    getLocale(),
    dayFormatter(),
  ]);
  const money = (paise: number) => (paise === 0 ? "–" : formatPaise(paise, locale));
  const th = "px-3 py-3 whitespace-nowrap";
  const td = "px-3 py-2.5 text-right whitespace-nowrap";

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
          <tr>
            <th scope="col" className={th}>
              {t("date")}
            </th>
            <th scope="col" className={th}>
              {t("booking")}
            </th>
            <th scope="col" className={th}>
              {t("kind")}
            </th>
            {AMOUNT_KEYS.map(([, key]) => (
              <th key={key} scope="col" className={cn(th, "text-right")}>
                {t(key)}
              </th>
            ))}
            <th scope="col" className={cn(th, "text-right")}>
              {t("net")}
            </th>
            {showPayout ? (
              <th scope="col" className={th}>
                {t("payout")}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={AMOUNT_KEYS.length + (showPayout ? 5 : 4)} className="px-4 py-8 text-center text-muted-foreground">
                {t("empty")}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="px-3 py-2.5 whitespace-nowrap">{day(r.entry_date)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {r.booking_id ? (
                    <Link href={`/admin/bookings/${r.booking_id}`} className="font-mono font-medium text-primary">
                      {r.bookingCode ?? t("booking")}
                    </Link>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="whitespace-nowrap">{t(`kinds.${r.kind}`)}</span>
                  {r.note ? <span className="block max-w-56 text-xs text-muted-foreground">{r.note}</span> : null}
                </td>
                {AMOUNT_KEYS.map(([column, key]) => (
                  <td key={key} className={td}>
                    {money(r[column])}
                  </td>
                ))}
                <td className={cn(td, "font-semibold")}>{formatPaise(r.net_paise, locale)}</td>
                {showPayout ? (
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {r.payout_id ? (
                      <Link
                        href={`/admin/payments/settlements/payouts/${r.payout_id}`}
                        className="font-mono text-primary"
                      >
                        {r.payoutNumber === null ? t("payout") : payoutReference(r.payoutNumber)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{t("unsettled")}</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
        {rows.length ? (
          <tfoot className="border-t bg-muted/30 font-semibold">
            <tr>
              <td className="px-3 py-2.5" colSpan={3}>
                {t("total", { count: totals.count })}
              </td>
              {AMOUNT_KEYS.map(([column, key]) => (
                <td key={key} className={td}>
                  {formatPaise(totals[column], locale)}
                </td>
              ))}
              <td className={td}>{formatPaise(totals.net_paise, locale)}</td>
              {showPayout ? <td /> : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
