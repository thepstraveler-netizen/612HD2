import { ArrowLeft, Check, Clock, FileText, MapPin, Package, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { QuoteActions } from "@/components/delivery/quote-actions";
import { PrescriptionStatusBadge } from "@/components/delivery/status-badges";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getInvoiceSettings, getPaymentSettings } from "@/lib/bookings/settings";
import { formatIndiaDateTime } from "@/lib/cabs/ui";
import { buildQuoteLines, orderPayModes } from "@/lib/delivery/cart";
import { getDeliverySettings } from "@/lib/delivery/queries";
import { addressLine, orderAddress, PRESCRIPTION_STEPS, prescriptionStepIndex } from "@/lib/delivery/ui";
import { razorpayConfig } from "@/lib/env.server";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { finalizePrice } from "@/lib/pricing/booking";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { quoteLinesSchema } from "@/schemas/delivery";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("medicine.account");
  return { title: t("detailTitle"), robots: { index: false } };
}

/**
 * One prescription: where its review stands, the pharmacy's live quote
 * (lines, GST, delivery, validity) to accept or decline, and the order it
 * became. Read with the customer's own session (RLS: own prescription and
 * its quotes only); totals are computed here, never in the browser.
 */
export default async function PrescriptionPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await requireUser(`/account/prescriptions/${id}`);
  const t = await getTranslations("medicine");
  const supabase = await createClient();
  const { data: rx } = await supabase
    .from("prescriptions")
    .select(
      "id, user_id, patient_name, patient_age, phone, address, files, notes, status, review_note, created_at, zone_id",
    )
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!rx) notFound();

  const [{ data: quotes }, { data: orders }, signed, settings, payments, invoice] = await Promise.all([
    supabase
      .from("medicine_quotes")
      .select("id, store_id, lines, delivery_fee_paise, note, valid_until, status, created_at")
      .eq("prescription_id", rx.id)
      .order("created_at", { ascending: false }),
    supabase.from("orders").select("booking_id, status").eq("prescription_id", rx.id),
    rx.files.length
      ? supabase.storage.from("prescriptions").createSignedUrls(rx.files, 600)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[], error: null }),
    getDeliverySettings(),
    getPaymentSettings(),
    getInvoiceSettings(),
  ]);

  const bookingIds = (orders ?? []).map((o) => o.booking_id);
  const { data: bookings } = bookingIds.length
    ? await supabase.from("bookings").select("id, code, status").in("id", bookingIds)
    : { data: [] as { id: string; code: string; status: string }[] };
  const order = bookings?.[0] ?? null;

  const now = Date.now();
  const live = (quotes ?? []).find((q) => q.status === "sent" && Date.parse(q.valid_until) > now) ?? null;
  const liveLines = live ? quoteLinesSchema.safeParse(live.lines) : null;
  const storeName = live
    ? ((await supabase.from("stores").select("name").eq("id", live.store_id).maybeSingle()).data?.name ??
      null)
    : null;

  let quoteView: {
    lines: {
      name: string;
      pack: string;
      qty: number;
      unitPaise: number;
      amountPaise: number;
      taxBps: number;
    }[];
    deliveryPaise: number;
    taxPaise: number;
    codTotalPaise: number;
    onlineTotalPaise: number;
    convenienceFeePaise: number;
    payModes: ("online" | "cod")[];
  } | null = null;
  if (live && liveLines?.success) {
    const cod = finalizePrice(
      buildQuoteLines(liveLines.data, live.delivery_fee_paise, settings, null),
      0,
      [],
    );
    const online = finalizePrice(
      buildQuoteLines(liveLines.data, live.delivery_fee_paise, settings, {
        convenienceFeePaise: payments.convenience_fee_paise,
        feeTaxBps: payments.fee_tax_bps,
        feeSac: invoice.sac_services,
      }),
      0,
      [],
    );
    quoteView = {
      lines: liveLines.data.map((l) => ({
        name: l.name,
        pack: l.pack,
        qty: l.qty,
        unitPaise: l.unit_price_paise,
        amountPaise: l.qty * l.unit_price_paise,
        taxBps: l.tax_bps,
      })),
      deliveryPaise: live.delivery_fee_paise,
      taxPaise: cod.taxPaise,
      codTotalPaise: cod.totalPaise,
      onlineTotalPaise: online.totalPaise,
      convenienceFeePaise: online.totalPaise - cod.totalPaise,
      payModes: orderPayModes(cod.totalPaise, settings, Boolean(razorpayConfig())),
    };
  }

  const money = (paise: number) => formatPaise(paise, locale);
  const address = orderAddress(rx.address);
  const reached = prescriptionStepIndex(rx.status);
  const ended = rx.status === "rejected" || rx.status === "expired";
  const fileLinks = (signed.data ?? []).filter((f) => f.signedUrl);

  return (
    <div className="space-y-6">
      <Link
        href="/account/prescriptions"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("account.all")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{formatIndiaDateTime(rx.created_at, locale, true)}</p>
          <h1 className="text-[length:var(--text-title)] leading-tight font-bold">
            {t("account.forPatient", { name: rx.patient_name })}
          </h1>
        </div>
        <PrescriptionStatusBadge status={rx.status} className="text-sm" />
      </div>

      <section aria-labelledby="rx-progress" className="rounded-2xl border bg-card p-4">
        <h2 id="rx-progress" className="sr-only">
          {t("account.progress")}
        </h2>
        {ended ? (
          <div className="flex items-start gap-3">
            <XCircle className="size-6 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-bold">{t(`account.ended.${rx.status}`)}</p>
              {rx.review_note ? <p className="text-sm text-muted-foreground">{rx.review_note}</p> : null}
            </div>
          </div>
        ) : (
          <ol className="grid grid-cols-4 gap-2">
            {PRESCRIPTION_STEPS.map((step, i) => {
              const done = i <= reached;
              return (
                <li
                  key={step}
                  className="flex flex-col items-center gap-1.5 text-center text-xs"
                  aria-current={i === reached ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-full border-2",
                      done
                        ? "border-accent-green bg-accent-green text-white"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className={cn(done ? "font-semibold" : "text-muted-foreground")}>
                    {t(`steps.${step}.short`)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {rx.status === "submitted" || rx.status === "reviewing" ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("account.reviewHint")}</p>
        ) : null}
      </section>

      {order ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Package className="size-5 text-accent-green" aria-hidden="true" />{" "}
            {t("account.ordered", { code: order.code })}
          </p>
          <Button asChild>
            <Link href={`/account/trips/${order.code}`}>{t("account.trackOrder")}</Link>
          </Button>
        </section>
      ) : null}

      {live && quoteView ? (
        <section
          aria-labelledby="rx-quote"
          className="space-y-4 rounded-2xl border-2 border-primary/40 bg-card p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="rx-quote" className="text-lg font-bold">
                {t("quote.title")}
              </h2>
              {storeName ? (
                <p className="text-sm text-muted-foreground">
                  {t("quote.from", { store: pickLocalized(storeName, locale) })}
                </p>
              ) : null}
            </div>
            <p className="inline-flex items-center gap-1 text-sm font-medium text-accent-orange">
              <Clock className="size-4" aria-hidden="true" />
              {t("quote.validUntil", { time: formatIndiaDateTime(live.valid_until, locale) })}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("quote.linesCaption")}</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pe-2 font-medium">
                    {t("quote.medicine")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    {t("quote.qty")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    {t("quote.price")}
                  </th>
                  <th scope="col" className="py-2 ps-2 text-right font-medium">
                    {t("quote.amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {quoteView.lines.map((l, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pe-2">
                      <span className="font-medium">{l.name}</span>
                      {l.pack ? <span className="block text-xs text-muted-foreground">{l.pack}</span> : null}
                      <span className="block text-xs text-muted-foreground">
                        {t("quote.gst", { rate: l.taxBps / 100 })}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">{l.qty}</td>
                    <td className="px-2 py-2 text-right">{money(l.unitPaise)}</td>
                    <td className="py-2 ps-2 text-right font-semibold">{money(l.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
            <dt>{t("quote.delivery")}</dt>
            <dd className="text-right">
              {quoteView.deliveryPaise ? money(quoteView.deliveryPaise) : t("quote.free")}
            </dd>
            <dt>{t("quote.taxes")}</dt>
            <dd className="text-right">{money(quoteView.taxPaise)}</dd>
            <dt className="border-t pt-2 font-bold">{t("quote.total")}</dt>
            <dd className="border-t pt-2 text-right text-lg font-extrabold">
              {money(quoteView.codTotalPaise)}
            </dd>
          </dl>
          {live.note ? <p className="rounded-xl bg-secondary p-3 text-sm">{live.note}</p> : null}
          <QuoteActions
            quoteId={live.id}
            locale={locale === "hi" ? "hi" : "en"}
            payModes={quoteView.payModes}
            totals={{ cod: quoteView.codTotalPaise, online: quoteView.onlineTotalPaise }}
            convenienceFeePaise={quoteView.convenienceFeePaise}
            description={`${storeName?.en ?? "Medicines"} · ${rx.patient_name}`}
          />
        </section>
      ) : rx.status === "quoted" && !order ? (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          {t("account.quoteLapsed")}
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
          <h2 className="text-base font-bold">{t("account.details")}</h2>
          <dl className="grid gap-2">
            <div>
              <dt className="text-xs text-muted-foreground">{t("account.patient")}</dt>
              <dd className="font-semibold">
                {rx.patient_name}
                {rx.patient_age !== null ? ` · ${t("account.age", { age: rx.patient_age })}` : ""}
              </dd>
            </div>
            {address ? (
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" aria-hidden="true" /> {t("account.deliverTo")}
                </dt>
                <dd>
                  {address.contact_name} · {address.phone}
                </dd>
                <dd className="text-muted-foreground">{addressLine(address)}</dd>
              </div>
            ) : null}
            {rx.notes ? (
              <div>
                <dt className="text-xs text-muted-foreground">{t("account.notes")}</dt>
                <dd>{rx.notes}</dd>
              </div>
            ) : null}
          </dl>
        </section>
        <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
          <h2 className="text-base font-bold">{t("account.files")}</h2>
          <ul className="space-y-1.5">
            {fileLinks.length
              ? fileLinks.map((f, i) => (
                  <li key={f.path ?? i}>
                    <a
                      href={f.signedUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
                    >
                      <FileText className="size-4" aria-hidden="true" /> {t("account.fileN", { n: i + 1 })}
                    </a>
                  </li>
                ))
              : rx.files.map((_, i) => (
                  <li key={i} className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="size-4" aria-hidden="true" /> {t("account.fileN", { n: i + 1 })}
                  </li>
                ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
