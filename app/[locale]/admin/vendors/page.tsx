import { Search, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { VendorSubnav } from "@/components/admin/vendor-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import { listVendors } from "@/lib/partners/admin-queries";
import { vendorStatusTone } from "@/lib/partners/admin-rows";
import { hasPermission } from "@/lib/permissions/check";
import { VENDOR_KINDS, VENDOR_STATUSES, vendorFiltersSchema } from "@/schemas/vendor-admin";

/** Every vendor (hotels, stores, transport, …): search by name, filter by kind and status. */
export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("vendors.read", "/admin/vendors");
  const canWrite = hasPermission(session.permissions, "vendors.write");
  const raw = await searchParams;
  const filters = vendorFiltersSchema.parse({
    q: typeof raw.q === "string" && raw.q.trim() ? raw.q : undefined,
    kind: raw.kind || undefined,
    status: raw.status || undefined,
  });
  const [t, vendors] = await Promise.all([getTranslations("vendorsAdmin"), listVendors(filters)]);
  const active = Boolean(filters.q || filters.kind || filters.status);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("title")}
        lead={t("lead")}
        newHref={canWrite ? "/admin/vendors/new" : undefined}
        newLabel={t("new")}
      >
        <VendorSubnav active="vendors" />
      </AdminPageHeader>
      <form method="get" role="search" className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="vf-q">{t("filters.search")}</Label>
          <Input id="vf-q" name="q" defaultValue={filters.q ?? ""} placeholder={t("filters.searchPlaceholder")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vf-kind">{t("filters.kind")}</Label>
          <NativeSelect id="vf-kind" name="kind" defaultValue={filters.kind ?? ""}>
            <option value="">{t("filters.any")}</option>
            {VENDOR_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vf-status">{t("filters.status")}</Label>
          <NativeSelect id="vf-status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">{t("filters.any")}</option>
            {VENDOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`vendorStatus.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <Button type="submit">
            <Search /> {t("filters.apply")}
          </Button>
          {active ? (
            <Button asChild variant="ghost">
              <Link href="/admin/vendors">
                <X /> {t("filters.clear")}
              </Link>
            </Button>
          ) : null}
        </div>
      </form>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("results", { count: vendors.length })}
      </p>
      <DataTable
        editHref="/admin/vendors"
        editLabel={canWrite ? undefined : t("view")}
        rows={vendors.map((v) => ({
          id: v.id,
          name: v.name,
          kind: t(`kinds.${v.kind}`),
          status: { label: t(`vendorStatus.${v.status}`), tone: vendorStatusTone(v.status) },
          city: v.city ?? "",
          phone: v.phone ?? "",
          commission: `${bpsToPercentInput(v.commission_bps)}%`,
          created: v.created_at,
        }))}
        columns={[
          { key: "name", header: t("columns.name") },
          { key: "kind", header: t("columns.kind"), kind: "badge" },
          { key: "status", header: t("columns.status"), kind: "tone" },
          { key: "city", header: t("columns.city") },
          { key: "phone", header: t("columns.phone"), sortable: false },
          { key: "commission", header: t("columns.commission") },
          { key: "created", header: t("columns.created"), kind: "date" },
        ]}
      />
    </div>
  );
}
