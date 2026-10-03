import {
  ArrowRight,
  BadgePercent,
  Ban,
  BedDouble,
  Handshake,
  Headset,
  IndianRupee,
  Receipt,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { todayInIndia } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions/check";
import { parseReportRange, rangeQuery } from "@/lib/reports/range";
import { REPORT_KEYS, type ReportKey } from "@/schemas/engagement-admin";

const ICONS: Record<ReportKey, typeof IndianRupee> = {
  sales: IndianRupee,
  occupancy: BedDouble,
  vendors: Handshake,
  agents: Headset,
  coupons: BadgePercent,
  cancellations: Ban,
};

/** Admin → Reports: one card per report; the chosen range carries over. */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("reports.read", "/admin/reports");
  const range = parseReportRange(await searchParams, todayInIndia());
  const t = await getTranslations("reportsAdmin");
  const query = rangeQuery(range);
  const cardClass =
    "block h-full rounded-2xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} lead={t("lead")} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORT_KEYS.map((key) => {
          const Icon = ICONS[key];
          return (
            <li key={key}>
              <Link href={`/admin/reports/${key}?${query}`} className={cardClass}>
                <Card className="h-full transition hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      {t(`reports.${key}.title`)}
                    </CardTitle>
                    <CardDescription>{t(`reports.${key}.lead`)}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          );
        })}
        {hasPermission(session.permissions, "payments.read") ? (
          <li>
            <Link href="/admin/payments/settlements/report" className={cardClass}>
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground">
                      <Receipt className="size-4" aria-hidden="true" />
                    </span>
                    {t("commission.title")}
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </CardTitle>
                  <CardDescription>{t("commission.lead")}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ) : null}
      </ul>
      <p className="text-sm text-muted-foreground">{t("basis")}</p>
    </div>
  );
}
