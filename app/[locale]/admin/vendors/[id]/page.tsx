import { FileText, Wallet } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ToneBadge } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { DocumentReview } from "@/components/admin/vendor-actions";
import { VendorForm } from "@/components/admin/vendor-form";
import {
  BankDetailsFacts,
  DetailCard,
  DocumentLink,
  FactList,
  dayFormatter,
  whenFormatter,
} from "@/components/admin/vendor-shared";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import { getVendor } from "@/lib/partners/admin-queries";
import {
  NEW_VENDOR,
  documentStatusTone,
  readBankDetails,
  vendorFormValues,
  vendorStatusTone,
} from "@/lib/partners/admin-rows";
import { applicationReference } from "@/lib/partners/status";
import { hasPermission } from "@/lib/permissions/check";

const LIST = "/admin/vendors";

/** One vendor: edit form, members, documents (verify / reject), payout details and links to the ledger. */
export default async function AdminVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  const session = await requirePermission(id ? "vendors.read" : "vendors.write", `${LIST}/${raw}`);
  const canWrite = hasPermission(session.permissions, "vendors.write");
  const canLedger = hasPermission(session.permissions, "payments.read");
  const [t, when, day, found] = await Promise.all([
    getTranslations("vendorsAdmin"),
    whenFormatter(),
    dayFormatter(),
    id ? getVendor(id) : null,
  ]);
  if (id && !found) notFound();

  if (!found) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title={t("newTitle")} lead={t("newLead")} backHref={LIST} backLabel={t("title")} />
        <div className="max-w-4xl">
          <VendorForm defaultValues={NEW_VENDOR} />
        </div>
      </div>
    );
  }

  const { vendor } = found;
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={vendor.name}
        lead={`${t(`kinds.${vendor.kind}`)}${vendor.city ? ` · ${vendor.city}` : ""}`}
        backHref={LIST}
        backLabel={t("title")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge tone={vendorStatusTone(vendor.status)} label={t(`vendorStatus.${vendor.status}`)} />
          {canLedger ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/payments/settlements/vendors/${vendor.id}`}>
                <Wallet /> {t("detail.ledger")}
              </Link>
            </Button>
          ) : null}
          {vendor.application_id ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/vendors/applications/${vendor.application_id}`}>
                <FileText />{" "}
                {found.applicationNumber
                  ? t("detail.applicationRef", { reference: applicationReference(found.applicationNumber) })
                  : t("detail.application")}
              </Link>
            </Button>
          ) : null}
        </div>
      </AdminPageHeader>

      <div className="grid max-w-5xl gap-6">
        {canWrite ? (
          <VendorForm key={vendor.updated_at} defaultValues={vendorFormValues(vendor)} />
        ) : (
          <DetailCard title={t("form.title")}>
            <FactList
              items={[
                { label: t("form.commission"), value: `${bpsToPercentInput(vendor.commission_bps)}%` },
                { label: t("form.contactName"), value: vendor.contact_name },
                { label: t("form.phone"), value: vendor.phone },
                { label: t("form.email"), value: vendor.email },
                { label: t("form.city"), value: vendor.city },
                { label: t("form.address"), value: vendor.address },
                { label: t("form.gstin"), value: vendor.gstin },
                { label: t("form.pan"), value: vendor.pan },
                { label: t("form.notes"), value: vendor.notes },
              ]}
            />
          </DetailCard>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <DetailCard title={t("members.title")}>
            {found.members.length ? (
              <ul className="grid gap-3 text-sm">
                {found.members.map((m) => (
                  <li key={m.userId} className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{m.name ?? m.email ?? m.userId}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[m.email, m.phone].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                      {t(`members.roles.${m.role}`)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("members.none")}</p>
            )}
          </DetailCard>

          <DetailCard title={t("bank.title")}>
            <BankDetailsFacts bank={readBankDetails(vendor.bank_details)} />
            <p className="text-xs text-muted-foreground">{t("bank.hint")}</p>
          </DetailCard>
        </div>

        <DetailCard title={t("documents.title")}>
          {found.documents.length ? (
            <ul className="grid gap-4">
              {found.documents.map((d) => (
                <li key={d.id} className="grid gap-2 border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <DocumentLink kind={d.kind} name={d.file_name} size={d.size_bytes} url={d.url} />
                    </div>
                    <ToneBadge tone={documentStatusTone(d.status)} label={t(`documents.status.${d.status}`)} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("documents.uploaded", { when: when(d.created_at) })}
                    {d.expires_on ? ` · ${t("documents.expires", { date: day(d.expires_on) })}` : ""}
                    {d.verified_at ? ` · ${t("documents.reviewedAt", { when: when(d.verified_at) })}` : ""}
                  </p>
                  {d.note ? <p className="text-sm whitespace-pre-line">{d.note}</p> : null}
                  {canWrite ? <DocumentReview id={d.id} status={d.status} note={d.note} /> : null}
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
              { label: t("applications.agreementVersion"), value: vendor.agreement_version },
              { label: t("applications.agreementAt"), value: when(vendor.agreement_accepted_at) },
              { label: t("detail.created"), value: when(vendor.created_at) },
              { label: t("detail.slug"), value: <span className="font-mono">{vendor.slug}</span> },
            ]}
          />
        </DetailCard>
      </div>
    </div>
  );
}
