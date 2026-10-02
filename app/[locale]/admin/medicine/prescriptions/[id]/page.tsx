import { ExternalLink, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { z } from "zod";
import { ToneBadge, type Tone } from "@/components/admin/booking-status";
import { indiaTime } from "@/components/admin/cab-trip-card";
import { MedicineQuoteBuilder } from "@/components/admin/medicine-quote-builder";
import { MedicineReviewActions } from "@/components/admin/medicine-review-actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { paiseToRupeesInput, formatPaise } from "@/lib/money";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import { getPrescription, storeOptions, zoneNames } from "@/lib/delivery/admin";
import { addressLine, canQuote, NEW_QUOTE_LINE, prescriptionTone } from "@/lib/delivery/admin-rows";
import { buildQuoteLines } from "@/lib/delivery/cart";
import { getDeliverySettings } from "@/lib/delivery/queries";
import { hasPermission } from "@/lib/permissions/check";
import { finalizePrice } from "@/lib/pricing/booking";
import { quoteLinesSchema } from "@/schemas/delivery";
import { PHARMACY_KINDS, type QuoteFormInput } from "@/schemas/delivery-admin";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const QUOTE_TONE: Record<string, Tone> = {
  sent: "info",
  accepted: "success",
  declined: "danger",
  expired: "muted",
  withdrawn: "muted",
};

/**
 * One prescription: patient, address and notes, the uploaded files (signed
 * links valid for five minutes), review actions, the quote builder and the
 * quotes sent so far.
 */
export default async function PrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await requirePermission("medicine.read", `/admin/medicine/prescriptions/${id}`);
  const canWrite = hasPermission(session.permissions, "medicine.write");
  const locale = await getLocale();
  const [t, format, detail, zones, pharmacies, settings] = await Promise.all([
    getTranslations("deliveryAdmin"),
    getFormatter(),
    getPrescription(id),
    zoneNames(locale),
    storeOptions(PHARMACY_KINDS, locale, true),
    getDeliverySettings(),
  ]);
  if (!detail) notFound();
  const { prescription: p, quotes, files } = detail;
  const live = quotes.find((q) => q.status === "sent") ?? null;
  const pharmacyName = new Map(pharmacies.map((o) => [o.value, o.label]));
  const address = p.address as Record<string, unknown>;

  // The builder starts from the latest quote, else one empty line.
  const latest = quotes[0];
  const latestLines = latest ? quoteLinesSchema.safeParse(latest.lines) : null;
  const quoteDefaults: QuoteFormInput = {
    prescription_id: p.id,
    store_id: latest?.store_id ?? p.store_id ?? "",
    lines: latestLines?.success
      ? latestLines.data.map((l) => ({
          name: l.name,
          pack: l.pack,
          qty: l.qty,
          unit_price: paiseToRupeesInput(l.unit_price_paise),
          gst_percent: bpsToPercentInput(l.tax_bps),
          hsn: l.hsn,
        }))
      : [{ ...NEW_QUOTE_LINE }],
    delivery_fee: latest ? paiseToRupeesInput(latest.delivery_fee_paise) : "0",
    note: latest?.note ?? "",
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={p.patient_name} backHref="/admin/medicine" backLabel={t("prescriptions.back")}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ToneBadge tone={prescriptionTone(p.status)} label={t(`prescriptionStatus.${p.status}`)} />
          <span>{indiaTime(format, p.created_at)}</span>
        </div>
        {canWrite ? (
          <MedicineReviewActions
            id={p.id}
            status={p.status}
            storeId={p.store_id}
            pharmacies={pharmacies}
            liveQuoteId={live?.id ?? null}
          />
        ) : null}
      </AdminPageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("prescriptions.patientSection")}>
          <Facts
            items={[
              [
                t("prescriptions.patient"),
                p.patient_age === null ? p.patient_name : `${p.patient_name} (${p.patient_age})`,
              ],
              [
                t("fields.phone"),
                <a key="phone" href={`tel:${p.phone}`} className="text-primary">
                  {p.phone}
                </a>,
              ],
              [t("prescriptions.zone"), zones.get(p.zone_id) ?? "–"],
              [
                t("prescriptions.address"),
                [typeof address.contact_name === "string" ? address.contact_name : "", addressLine(p.address)]
                  .filter(Boolean)
                  .join(" · ") || "–",
              ],
              [t("prescriptions.notes"), p.notes ?? "–"],
              [t("prescriptions.pharmacy"), p.store_id ? (pharmacyName.get(p.store_id) ?? "–") : "–"],
              ...(p.review_note
                ? [[t("prescriptions.reviewNote"), p.review_note] as [string, ReactNode]]
                : []),
            ]}
          />
        </Section>
        <Section title={t("prescriptions.files")}>
          <p className="text-xs text-muted-foreground">{t("prescriptions.filesHelp")}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {files.map((f, i) => (
              <li key={f.path} className="overflow-hidden rounded-xl border">
                {f.url && !f.isPdf ? (
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket */}
                    <img
                      src={f.url}
                      alt={t("prescriptions.fileAlt", { n: i + 1 })}
                      className="aspect-[3/4] w-full bg-muted object-contain"
                    />
                  </a>
                ) : null}
                <div className="flex items-center justify-between gap-2 p-2 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="size-4" aria-hidden="true" />
                    {t("prescriptions.file", { n: i + 1 })}
                  </span>
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary"
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" /> {t("prescriptions.openFile")}
                    </a>
                  ) : (
                    <span className="text-destructive">{t("prescriptions.fileMissing")}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {canWrite && canQuote(p.status) ? (
        <MedicineQuoteBuilder
          key={live?.id ?? latest?.id ?? "new"}
          defaultValues={quoteDefaults}
          pharmacies={pharmacies}
          settings={settings}
        />
      ) : null}

      <Section title={t("quote.history")}>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("quote.none")}</p>
        ) : (
          <ul className="grid gap-3">
            {quotes.map((q) => {
              const lines = quoteLinesSchema.safeParse(q.lines);
              const total = lines.success
                ? finalizePrice(buildQuoteLines(lines.data, q.delivery_fee_paise, settings, null), 0, [])
                    .totalPaise
                : null;
              return (
                <li key={q.id} className="grid gap-2 rounded-xl border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <ToneBadge tone={QUOTE_TONE[q.status] ?? "muted"} label={t(`quoteStatus.${q.status}`)} />
                    <span className="font-semibold">{total === null ? "–" : formatPaise(total, locale)}</span>
                    <span className="text-muted-foreground">
                      {pharmacyName.get(q.store_id) ?? "–"} · {indiaTime(format, q.created_at)} ·{" "}
                      {t("quote.validUntil", { when: indiaTime(format, q.valid_until) })}
                    </span>
                  </div>
                  {lines.success ? (
                    <ul className="text-muted-foreground">
                      {lines.data.map((l, i) => (
                        <li key={i}>
                          {l.qty} × {l.name}
                          {l.pack ? ` (${l.pack})` : ""} · {formatPaise(l.unit_price_paise, locale)} ·{" "}
                          {t("quote.gstAt", { percent: bpsToPercentInput(l.tax_bps) })}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {q.note ? <p>{q.note}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
