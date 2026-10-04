import { Download, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { rangeQuery, type ReportRange } from "@/lib/reports/range";
import { RANGE_PRESETS } from "@/schemas/engagement-admin";
import { ScrollRow } from "./scroll-row";

/**
 * Server-rendered pieces shared by the admin dashboard and the report pages:
 * the date-range bar (presets as links, a custom from–to form, optional CSV
 * link; everything lives in the URL) and the KPI tile.
 */

/** Tighter date input so From and To fit side by side on a 360px phone. */
const DATE_INPUT =
  "px-2.5 [&::-webkit-calendar-picker-indicator]:ml-1 [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:p-0";

export async function ReportRangeBar({
  basePath,
  range,
  csvHref,
}: {
  basePath: string;
  range: ReportRange;
  csvHref?: string;
}) {
  const t = await getTranslations("reportsAdmin.range");
  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-4">
      <ScrollRow as="nav" label={t("label")} className="-mx-4" innerClassName="px-4">
        {RANGE_PRESETS.filter((p) => p !== "custom").map((preset) => (
          <Link
            key={preset}
            href={`${basePath}?${rangeQuery({ preset, from: range.from, to: range.to })}`}
            aria-current={range.preset === preset ? "true" : undefined}
            className={
              range.preset === preset
                ? "inline-flex min-h-10 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
                : "inline-flex min-h-10 shrink-0 items-center rounded-full border bg-card px-4 text-sm font-medium hover:bg-accent"
            }
          >
            {t(`presets.${preset}`)}
          </Link>
        ))}
      </ScrollRow>
      {/* Phones: From and To side by side, the buttons on one row under them. */}
      <form method="get" className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <input type="hidden" name="range" value="custom" />
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="range-from">{t("from")}</Label>
          <Input
            id="range-from"
            name="from"
            type="date"
            defaultValue={range.from}
            required
            className={DATE_INPUT}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="range-to">{t("to")}</Label>
          <Input
            id="range-to"
            name="to"
            type="date"
            defaultValue={range.to}
            required
            className={DATE_INPUT}
          />
        </div>
        <div className="col-span-2 flex gap-2 sm:contents">
          <Button
            type="submit"
            variant={range.preset === "custom" ? "default" : "outline"}
            className="flex-1 sm:flex-none"
          >
            <Search /> {t("apply")}
          </Button>
          {csvHref ? (
            <Button asChild variant="outline" className="flex-1 sm:flex-none">
              <a href={csvHref} download>
                <Download /> {t("csv")}
              </a>
            </Button>
          ) : null}
        </div>
      </form>
      <p className="text-xs text-muted-foreground">{t("showing", { from: range.from, to: range.to })}</p>
    </div>
  );
}

export function KpiCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-1 rounded-2xl border bg-card p-3 sm:p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xl font-bold [overflow-wrap:anywhere] tabular-nums sm:text-2xl">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function InsightCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="grid min-w-0 content-start gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
