import { getTranslations } from "next-intl/server";
import { LeadBoard, LeadFiltersForm, LeadTable, LeadViewBar } from "@/components/admin/lead-board";
import { NewLeadButton } from "@/components/admin/lead-new";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { BOARD_LIMIT, LEADS_PAGE_SIZE, getLeadStaff, listLeads } from "@/lib/leads/crm";
import { getLeadsSettings } from "@/lib/leads/settings";
import { leadFiltersQuery, parseLeadFilters } from "@/lib/leads/ui";
import { hasPermission } from "@/lib/permissions/check";

/**
 * The leads pipeline: a board (one column per status, newest first) or a
 * paged list, with every filter in the URL. Filtering and paging run in the
 * database (lib/leads/crm.ts listLeads).
 */
export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("leads.read", "/admin/leads");
  const filters = parseLeadFilters(await searchParams);
  const canWrite = hasPermission(session.permissions, "leads.write");
  const [t, list, staff, settings] = await Promise.all([
    getTranslations("leadsAdmin"),
    listLeads(filters),
    getLeadStaff(),
    getLeadsSettings(),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / LEADS_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} lead={t("lead")}>
        {canWrite ? <NewLeadButton sources={settings.sources} /> : null}
      </AdminPageHeader>
      <LeadViewBar filters={filters} overdue={list.overdue} />
      <LeadFiltersForm filters={filters} sources={settings.sources} staff={staff} />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("filters.results", { count: list.total })}
      </p>
      {filters.view === "list" ? (
        <>
          <LeadTable leads={list.leads} />
          {pages > 1 ? (
            <nav className="flex items-center justify-end gap-2 text-sm" aria-label={t("pagination.label")}>
              <span className="text-muted-foreground">
                {t("pagination.page", { page: filters.page, pages })}
              </span>
              {filters.page > 1 ? (
                <Button asChild variant="outline">
                  <Link href={`/admin/leads${leadFiltersQuery(filters, { page: filters.page - 1 })}`}>
                    {t("pagination.prev")}
                  </Link>
                </Button>
              ) : null}
              {filters.page < pages ? (
                <Button asChild variant="outline">
                  <Link href={`/admin/leads${leadFiltersQuery(filters, { page: filters.page + 1 })}`}>
                    {t("pagination.next")}
                  </Link>
                </Button>
              ) : null}
            </nav>
          ) : null}
        </>
      ) : (
        <LeadBoard
          leads={list.leads}
          counts={list.counts}
          canWrite={canWrite}
          lostReasons={settings.lost_reasons}
          limit={BOARD_LIMIT}
        />
      )}
    </div>
  );
}
