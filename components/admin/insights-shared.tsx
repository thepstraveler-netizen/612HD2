import { Download, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { rangeQuery, type ReportRange } from "@/lib/reports/range";
import { RANGE_PRESETS } from "@/schemas/engagement-admin";

/**
 * Server-rendered pieces shared by the admin dashboard and the report pages:
 * the date-range bar (presets as links, a custom from–to form, optional CSV
 * link; everything lives in the URL) and the KPI tile.
 */

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
      <nav aria-label={t("label")} className="-mx-1 flex gap-1 overflow-x-auto px-1">
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
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="range" value="custom" />
        <div className="grid gap-1.5">
          <Label htmlFor="range-from">{t("from")}</Label>
          <Input id="range-from" name="from" type="date" defaultValue={range.from} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="range-to">{t("to")}</Label>
          <Input id="range-to" name="to" type="date" defaultValue={range.to} required />
        </div>
        <Button type="submit" variant={range.preset === "custom" ? "default" : "outline"}>
          <Search /> {t("apply")}
        </Button>
        {csvHref ? (
          <Button asChild variant="outline">
            <a href={csvHref} download>
              <Download /> {t("csv")}
            </a>
          </Button>
        ) : null}
      </form>
      <p className="text-xs text-muted-foreground">{t("showing", { from: range.from, to: range.to })}</p>
    </div>
  );
}

export function KpiCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1 rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
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
