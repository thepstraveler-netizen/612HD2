import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { VendorSubnav } from "@/components/admin/vendor-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { requirePermission } from "@/lib/auth/guards";
import { listApplications } from "@/lib/partners/admin-queries";
import { applicationStatusTone } from "@/lib/partners/admin-rows";
import { applicationReference } from "@/lib/partners/status";
import { APPLICATION_STATUSES } from "@/schemas/partners";
import { applicationFiltersSchema } from "@/schemas/vendor-admin";

/** Partner applications, open ones (oldest first) by default. */
export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("vendors.read", "/admin/vendors/applications");
  const raw = await searchParams;
  const filters = applicationFiltersSchema.parse({
    status: raw.status || undefined,
    q: typeof raw.q === "string" && raw.q.trim() ? raw.q : undefined,
  });
  const [t, apps] = await Promise.all([getTranslations("vendorsAdmin"), listApplications(filters)]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("applications.title")} lead={t("applications.lead")}>
        <VendorSubnav active="applications" />
      </AdminPageHeader>
      <form method="get" role="search" className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="af-q">{t("filters.search")}</Label>
          <Input
            id="af-q"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={t("applications.searchPlaceholder")}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="af-status">{t("filters.status")}</Label>
          <NativeSelect id="af-status" name="status" defaultValue={filters.status}>
            <option value="open">{t("applications.open")}</option>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`applicationStatus.${s}`)}
              </option>
            ))}
            <option value="all">{t("applications.all")}</option>
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <Search /> {t("filters.apply")}
          </Button>
        </div>
      </form>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("applications.results", { count: apps.length })}
      </p>
      <DataTable
        editHref="/admin/vendors/applications"
        editLabel={t("view")}
        rows={apps.map((a) => ({
          id: a.id,
          reference: applicationReference(a.number),
          business: a.business_name,
          contact: a.contact_name,
          type: t(`businessTypes.${a.business_type}`),
          city: a.city,
          submitted: a.created_at,
          status: { label: t(`applicationStatus.${a.status}`), tone: applicationStatusTone(a.status) },
        }))}
        columns={[
          { key: "reference", header: t("columns.reference") },
          { key: "business", header: t("columns.business") },
          { key: "contact", header: t("columns.contact") },
          { key: "type", header: t("columns.type"), kind: "badge" },
          { key: "city", header: t("columns.city") },
          { key: "submitted", header: t("columns.submitted"), kind: "date" },
          { key: "status", header: t("columns.status"), kind: "tone" },
        ]}
      />
    </div>
  );
}
