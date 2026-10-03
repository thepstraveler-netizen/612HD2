import { CalendarClock, CircleAlert, Landmark, ReceiptIndianRupee, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatPaise } from "@/lib/money";
import { formatDay, indiaToday, nextCycleEnd, vendorHref } from "@/lib/partners/ui";
import { getVendorEarnings, type PortalContext } from "@/lib/partners/vendor-queries";
import { getSettlementsSettings } from "@/lib/settlements/settings";
import { balanceDirection } from "@/lib/settlements/statement";
import { cn } from "@/lib/utils";

/** Vendor home for businesses without stores: money at a glance and shortcuts. */
export async function VendorHomeSummary({ portal, locale }: { portal: PortalContext; locale: string }) {
  const t = await getTranslations("vendorEarnings");
  const { vendor } = portal;
  const [{ unsettled: open, payouts }, settings] = await Promise.all([
    getVendorEarnings(vendor.id),
    getSettlementsSettings(),
  ]);
  const direction = balanceDirection(open.net_paise);
  const lastPaid = payouts.find((p) => p.status === "paid");
  const multiple = portal.vendors.length > 1;
  const href = (path: string) => vendorHref(path, vendor.id, multiple);
  const noPayout = !vendor.bank.account_number && !vendor.bank.upi_id;

  const tiles = [
    {
      icon: Wallet,
      label: t("balance.title"),
      value: formatPaise(open.net_paise, locale),
      hint: t(`balance.${direction}`),
      tone: direction === "collect" ? "border-accent-orange/60 bg-accent-orange/10" : "bg-card",
    },
    {
      icon: CalendarClock,
      label: t("cutoff.title"),
      value: formatDay(nextCycleEnd(indiaToday(), settings.cycle_days), locale),
      hint: t("cutoff.body"),
      tone: "bg-card",
    },
    {
      icon: ReceiptIndianRupee,
      label: t("home.lastPayout"),
      value: lastPaid ? formatPaise(lastPaid.amountPaise, locale) : t("home.none"),
      hint: lastPaid?.paidAt ? `${lastPaid.reference} · ${formatDay(lastPaid.paidAt, locale)}` : "",
      tone: "bg-card",
    },
  ];

  return (
    <div className="space-y-6">
      <section aria-labelledby="summary" className="space-y-3">
        <h1 id="summary" className="text-xl font-bold">
          {t("home.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{vendor.name}</p>
        {vendor.status !== "active" ? (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-accent-orange/10 p-3 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-accent-orange" aria-hidden="true" />
            {vendor.status === "pending" ? t("home.pending") : t("home.suspended")}
          </p>
        ) : null}
        <dl className="grid gap-3 sm:grid-cols-3">
          {tiles.map(({ icon: Icon, label, value, hint, tone }) => (
            <div key={label} className={cn("rounded-2xl border p-4", tone)}>
              <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" /> {label}
              </dt>
              <dd className="mt-1 space-y-1">
                <span className="block text-2xl font-extrabold">{value}</span>
                {hint ? <span className="block text-sm text-muted-foreground">{hint}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {noPayout ? (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-primary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm">
            <Landmark className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {t("home.addPayout")}
          </p>
          <Button asChild>
            <Link href={href("/vendor/business")}>{t("home.addPayoutCta")}</Link>
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild size="lg">
          <Link href={href("/vendor/earnings")}>{t("home.viewEarnings")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={href("/vendor/business")}>{t("home.business")}</Link>
        </Button>
      </div>
    </div>
  );
}
