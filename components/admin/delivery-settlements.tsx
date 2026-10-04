import { Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { getSettlement } from "@/lib/delivery/admin";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import type { IsoDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import type { StoreKind } from "@/schemas/delivery";

/**
 * Read-only settlement statement: delivered orders in an India date range,
 * per vendor — gross, commission (on gross), net payable, and how it was
 * paid (cash on delivery vs online). Payouts are recorded on the vendor
 * ledger (Payments → Settlements), linked from here.
 */
export async function DeliverySettlements({
  kinds,
  range,
}: {
  kinds: readonly StoreKind[];
  range: { from: IsoDate; to: IsoDate };
}) {
  const [t, locale, { rows, totals }] = await Promise.all([
    getTranslations("deliveryAdmin.settlements"),
    getLocale(),
    getSettlement(kinds, range.from, range.to),
  ]);
  const money = (paise: number) => formatPaise(paise, locale);

  return (
    <div className="space-y-4">
      {/* Phones: From and To side by side, Apply under them. */}
      <form
        method="get"
        className="grid grid-cols-2 items-end gap-3 rounded-2xl border bg-card p-4 sm:flex sm:flex-wrap"
      >
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="st-from">{t("from")}</Label>
          <Input id="st-from" name="from" type="date" defaultValue={range.from} className="px-2.5" />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="st-to">{t("to")}</Label>
          <Input id="st-to" name="to" type="date" defaultValue={range.to} className="px-2.5" />
        </div>
        <Button type="submit" className="col-span-2">
          <Search /> {t("apply")}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {t("basis")}{" "}
        <Link href="/admin/payments/settlements" className="font-medium text-primary">
          {t("ledgerLink")}
        </Link>
      </p>
      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <ul className="grid gap-2 md:hidden">
            {[
              ...rows.map((r) => ({ ...r, key: r.vendorId, total: false })),
              { ...totals, key: "total", vendorName: t("total"), commissionBps: null, total: true },
            ].map((r) => (
              <li
                key={r.key}
                className={
                  r.total
                    ? "grid gap-2 rounded-2xl border bg-muted/30 p-4 text-sm"
                    : "grid gap-2 rounded-2xl border bg-card p-4 text-sm"
                }
              >
                <div className="flex items-baseline justify-between gap-2 font-semibold">
                  <span className="min-w-0 break-words">{r.vendorName}</span>
                  <span className="shrink-0 tabular-nums">{money(r.netPaise)}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("orders")}</dt>
                    <dd className="tabular-nums">{r.orders}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("gross")}</dt>
                    <dd className="tabular-nums">{money(r.grossPaise)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("commission")}</dt>
                    <dd className="tabular-nums">
                      {money(r.commissionPaise)}
                      {r.commissionBps !== null ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({bpsToPercentInput(r.commissionBps)}%)
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("cod")}</dt>
                    <dd className="tabular-nums">{money(r.codPaise)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("online")}</dt>
                    <dd className="tabular-nums">{money(r.onlinePaise)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">{t("vendor")}</th>
                  <th className="px-4 py-3 text-right">{t("orders")}</th>
                  <th className="px-4 py-3 text-right">{t("gross")}</th>
                  <th className="px-4 py-3 text-right">{t("commission")}</th>
                  <th className="px-4 py-3 text-right">{t("net")}</th>
                  <th className="px-4 py-3 text-right">{t("cod")}</th>
                  <th className="px-4 py-3 text-right">{t("online")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.vendorId} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">{r.vendorName}</td>
                    <td className="px-4 py-2.5 text-right">{r.orders}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(r.grossPaise)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {money(r.commissionPaise)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({bpsToPercentInput(r.commissionBps)}%)
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                      {money(r.netPaise)}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(r.codPaise)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(r.onlinePaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-semibold">
                <tr>
                  <td className="px-4 py-2.5">{t("total")}</td>
                  <td className="px-4 py-2.5 text-right">{totals.orders}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(totals.grossPaise)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {money(totals.commissionPaise)}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(totals.netPaise)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(totals.codPaise)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(totals.onlinePaise)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
