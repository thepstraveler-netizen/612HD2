import { TriangleAlert } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ExpiryAlert, FleetExpiryAlert } from "@/lib/cabs/expiry";
import type { ToneCell } from "./data-table";

type Translate = Awaited<ReturnType<typeof getTranslations>>;
type Format = Awaited<ReturnType<typeof getFormatter>>;

function day(format: Format, iso: string) {
  return format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
}

/** "Insurance expired 3 Oct 2026" / "PUC expires 20 Oct 2026". */
export function expiryText(t: Translate, format: Format, alert: ExpiryAlert): string {
  const paper = t(`expiry.papers.${alert.paper}`);
  const date = day(format, alert.date);
  return alert.state === "expired"
    ? t("expiry.expired", { paper, date })
    : t("expiry.expiring", { paper, date });
}

/** A list cell: the most urgent alert, red when anything has expired; "OK" otherwise. */
export function expiryCell(t: Translate, format: Format, alerts: readonly ExpiryAlert[]): ToneCell {
  const first = alerts[0];
  if (!first) return { label: t("expiry.ok"), tone: "success" };
  const more = alerts.length > 1 ? ` ${t("expiry.more", { count: alerts.length - 1 })}` : "";
  return {
    label: `${expiryText(t, format, first)}${more}`,
    tone: first.state === "expired" ? "danger" : "warning",
  };
}

/** Banner listing fleet papers that have expired or expire within 30 days, linking to each record. */
export async function FleetAlerts({
  alerts,
  limit = 8,
}: {
  alerts: readonly FleetExpiryAlert[];
  limit?: number;
}) {
  if (alerts.length === 0) return null;
  const [t, format] = await Promise.all([getTranslations("cabsAdmin"), getFormatter()]);
  const expired = alerts.some((a) => a.state === "expired");
  return (
    <section
      aria-labelledby="fleet-alerts"
      className={
        expired
          ? "space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
          : "space-y-2 rounded-2xl border border-accent-amber/30 bg-accent-amber/5 p-4"
      }
    >
      <h2 id="fleet-alerts" className="flex items-center gap-2 text-sm font-semibold">
        <TriangleAlert className="size-4" aria-hidden="true" />
        {t("expiry.title", { count: alerts.length })}
      </h2>
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {alerts.slice(0, limit).map((a) => (
          <li key={`${a.owner}-${a.ownerId}-${a.paper}`}>
            <Link
              href={`/admin/cabs/${a.owner === "driver" ? "drivers" : "vehicles"}/${a.ownerId}`}
              className="font-medium text-primary"
            >
              {a.label}
            </Link>{" "}
            <span className={a.state === "expired" ? "text-destructive" : "text-accent-amber"}>
              {expiryText(t, format, a)}
            </span>
          </li>
        ))}
      </ul>
      {alerts.length > limit ? (
        <p className="text-xs text-muted-foreground">{t("expiry.more", { count: alerts.length - limit })}</p>
      ) : null}
    </section>
  );
}
