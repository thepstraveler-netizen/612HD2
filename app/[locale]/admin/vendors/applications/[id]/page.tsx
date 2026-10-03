import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ToneBadge } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ApplicationActions } from "@/components/admin/vendor-actions";
import { DetailCard, DocumentLink, FactList, whenFormatter } from "@/components/admin/vendor-shared";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import { getApplication } from "@/lib/partners/admin-queries";
import { applicationStatusTone, humanizeKey, readApplicationDetails } from "@/lib/partners/admin-rows";
import { getPartnersSettings } from "@/lib/partners/settings";
import { applicationReference, defaultCommissionBps } from "@/lib/partners/status";
import { hasPermission } from "@/lib/permissions/check";

const LIST = "/admin/vendors/applications";

/** One partner application: everything the applicant sent, documents, agreement and the review actions. */
export default async function AdminApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  if (!id) notFound();
  const session = await requirePermission("vendors.read", `${LIST}/${raw}`);
  const canWrite = hasPermission(session.permissions, "vendors.write");
  const [t, tp, found, settings, when] = await Promise.all([
    getTranslations("vendorsAdmin"),
    getTranslations("partner"),
    getApplication(id),
    getPartnersSettings(),
    whenFormatter(),
  ]);
  if (!found) notFound();
  const { app } = found;

  const detailLabel = (key: string) =>
    tp.has(`detailFields.${key}.label`) ? tp(`detailFields.${key}.label`) : humanizeKey(key);
  const detailValue = (key: string, value: string) =>
    tp.has(`detailFields.${key}.options.${value}`) ? tp(`detailFields.${key}.options.${value}`) : value;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={app.business_name}
        lead={`${applicationReference(app.number)} · ${t(`businessTypes.${app.business_type}`)}`}
        backHref={LIST}
        backLabel={t("applications.title")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge tone={applicationStatusTone(app.status)} label={t(`applicationStatus.${app.status}`)} />
          {app.vendor_id ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/vendors/${app.vendor_id}`}>
                {t("applications.openVendor", { name: found.vendorName ?? app.business_name })} <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>
        {canWrite && (app.status === "submitted" || app.status === "under_review") ? (
          <ApplicationActions
            id={app.id}
            status={app.status}
            defaultCommissionPercent={bpsToPercentInput(defaultCommissionBps(settings, app.business_type))}
          />
        ) : null}
      </AdminPageHeader>

      {app.review_note || app.reviewed_at ? (
        <div className="rounded-2xl border bg-muted/40 p-4 text-sm">
          <p className="font-medium">
            {t("applications.reviewed", { who: found.reviewer ?? "–", when: when(app.reviewed_at) })}
          </p>
          {app.review_note ? <p className="mt-1 whitespace-pre-line">{app.review_note}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard title={t("applications.business")}>
          <FactList
            items={[
              { label: t("form.contactName"), value: app.contact_name },
              {
                label: t("form.phone"),
                value: (
                  <a className="text-primary" href={`tel:${app.phone}`}>
                    {app.phone}
                  </a>
                ),
              },
              {
                label: t("form.email"),
                value: (
                  <a className="text-primary" href={`mailto:${app.email}`}>
                    {app.email}
                  </a>
                ),
              },
              { label: t("form.city"), value: app.city },
              { label: t("form.address"), value: app.address },
              { label: t("form.gstin"), value: app.gstin },
              { label: t("form.pan"), value: app.pan },
              { label: t("applications.website"), value: app.website },
              { label: t("columns.submitted"), value: when(app.created_at) },
              { label: t("applications.language"), value: app.locale === "hi" ? "हिन्दी" : "English" },
            ]}
          />
          {app.message ? (
            <div className="grid gap-1 text-sm">
              <p className="text-xs text-muted-foreground">{t("applications.message")}</p>
              <p className="whitespace-pre-line">{app.message}</p>
            </div>
          ) : null}
        </DetailCard>

        <DetailCard title={t("applications.details")}>
          {readApplicationDetails(app.details).length ? (
            <FactList
              items={readApplicationDetails(app.details).map(([key, value]) => ({
                label: detailLabel(key),
                value: detailValue(key, value),
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("applications.noDetails")}</p>
          )}
        </DetailCard>

        <DetailCard title={t("documents.title")}>
          {found.documents.length ? (
            <ul className="grid gap-3">
              {found.documents.map((d) => (
                <li key={d.path}>
                  <DocumentLink kind={d.kind} name={d.name} size={d.size} url={d.url} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("documents.none")}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("documents.linkHint")}</p>
        </DetailCard>

        <DetailCard title={t("applications.agreement")}>
          <FactList
            items={[
              { label: t("applications.agreementVersion"), value: app.agreement_version },
              { label: t("applications.agreementName"), value: app.agreement_name },
              { label: t("applications.agreementAt"), value: when(app.agreement_accepted_at) },
            ]}
          />
        </DetailCard>
      </div>
    </div>
  );
}
