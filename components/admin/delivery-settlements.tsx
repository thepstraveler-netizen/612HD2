import { Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettlement } from "@/lib/delivery/admin";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import type { IsoDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import type { StoreKind } from "@/schemas/delivery";

/**
 * Read-only settlement statement: delivered orders in an India date range,
 * per vendor — gross, commission (on gross), net payable, and how it was
 * paid (cash on delivery vs online). No payouts are recorded here.
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
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="st-from">{t("from")}</Label>
          <Input id="st-from" name="from" type="date" defaultValue={range.from} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="st-to">{t("to")}</Label>
          <Input id="st-to" name="to" type="date" defaultValue={range.to} />
        </div>
        <Button type="submit">
          <Search /> {t("apply")}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">{t("basis")}</p>
      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
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
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(totals.commissionPaise)}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(totals.netPaise)}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(totals.codPaise)}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(totals.onlinePaise)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
