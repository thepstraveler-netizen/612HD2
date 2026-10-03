"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Ban, Copy, ExternalLink, FilePlus2, HandCoins, Pencil, PartyPopper, Send, X } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider, useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import { ToneBadge } from "@/components/admin/booking-status";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { QuoteView } from "@/lib/leads/crm";
import { cancelQuote, recordQuotePayment, sendQuote } from "@/lib/leads/crm-actions";
import { quoteActions, quoteFormDefaults, quoteStatusTone } from "@/lib/leads/ui";
import { formatPaise, paiseToRupeesInput } from "@/lib/money";
import {
  quoteOfflinePaymentSchema,
  type LeadsSettings,
  type QuoteOfflinePaymentInput,
} from "@/schemas/leads";
import { SelectField, TextInputField } from "./form-fields";
import { LeadSheet, copyText, useLeadAction, useLeadsErrorText } from "./lead-shared";
import { QuoteBuilder, type SentQuote } from "./quote-builder";

const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "other"] as const;

type Editing = { mode: "new" } | { mode: "edit"; quote: QuoteView } | null;

/**
 * Quotes on a lead: each quote with its status, totals, booking and links,
 * the actions that apply (edit / send a draft, withdraw, record a payment
 * made outside Razorpay) and the quote builder.
 */
export function LeadQuotes({
  leadId,
  quotes,
  settings,
  defaultTitle,
  leadOpen,
  canWrite,
  canPay,
  canViewBookings,
}: {
  leadId: string;
  quotes: QuoteView[];
  settings: Pick<LeadsSettings, "quote_tax_bps" | "quote_sac" | "quote_valid_hours">;
  /** Suggested title for a new quote (the lead's summary). */
  defaultTitle: string;
  /** False once the lead is Won or Lost: no new or edited quotes. */
  leadOpen: boolean;
  canWrite: boolean;
  canPay: boolean;
  /** bookings.read: link the booking code to Admin → Bookings. */
  canViewBookings: boolean;
}) {
  const t = useTranslations("leadsAdmin.quotes");
  const format = useFormatter();
  const locale = useLocale();
  const { pending, run } = useLeadAction();
  const [editing, setEditing] = useState<Editing>(null);
  const [sent, setSent] = useState<SentQuote | null>(null);
  const [paying, setPaying] = useState<QuoteView | null>(null);
  const money = (paise: number) => formatPaise(paise, locale);
  const when = (iso: string | null) =>
    iso
      ? format.dateTime(new Date(iso), {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        })
      : "–";
  const paid = quotes.find((q) => q.status === "paid");

  const send = (quote: QuoteView) => {
    if (!window.confirm(t("confirmSend"))) return;
    run(sendQuote, { quoteId: quote.id }, { success: t("sent"), onDone: (r) => setSent(r) });
  };
  const withdraw = (quote: QuoteView) => {
    if (!window.confirm(quote.status === "sent" ? t("confirmWithdrawSent") : t("confirmWithdraw"))) return;
    run(cancelQuote, { quoteId: quote.id }, { success: t("withdrawn") });
  };

  const bookingLink = (id: string | null, code: string | null) =>
    !code ? null : canViewBookings && id ? (
      <Link href={`/admin/bookings/${id}`} className="font-mono font-medium text-primary">
        {code}
      </Link>
    ) : (
      <span className="font-mono font-medium">{code}</span>
    );

  return (
    <div className="space-y-4">
      {paid ? (
        <p className="flex items-start gap-2 rounded-xl border border-accent-green/30 bg-accent-green/10 p-3 text-sm">
          <PartyPopper className="mt-0.5 size-4 shrink-0 text-accent-green" aria-hidden="true" />
          <span>
            {t("paidNote", { number: paid.number })} {bookingLink(paid.bookingId, paid.bookingCode)}
          </span>
        </p>
      ) : null}

      {sent ? (
        <div className="grid gap-3 rounded-xl border bg-muted/40 p-3 text-sm" role="status">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{t("sentTitle")}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mt-2 -mr-2"
              aria-label={t("dismiss")}
              onClick={() => setSent(null)}
            >
              <X />
            </Button>
          </div>
          {sent.warning ? (
            <p className="text-accent-amber">
              {t.has(`warnings.${sent.warning}`) ? t(`warnings.${sent.warning}`) : t("warnings.linkFailed")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {sent.quoteUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => copyText(sent.quoteUrl ?? "", t("copied"))}
              >
                <Copy /> {t("copyQuoteLink")}
              </Button>
            ) : null}
            {sent.payUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => copyText(sent.payUrl ?? "", t("copied"))}
              >
                <Copy /> {t("copyPayLink")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {quotes.length === 0 && !editing ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : null}

      <ul className="space-y-3">
        {quotes.map((quote) => {
          const actions = quoteActions(quote.status, { canWrite, canPay, leadOpen });
          return (
            <li key={quote.id} className="grid gap-3 rounded-2xl border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold break-words">
                    {t("number", { number: quote.number })} · {quote.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {quote.paidAt
                      ? t("paidOn", { date: when(quote.paidAt) })
                      : quote.sentAt
                        ? t("sentOn", { date: when(quote.sentAt) })
                        : t("createdOn", { date: when(quote.createdAt) })}
                  </p>
                </div>
                <ToneBadge tone={quoteStatusTone(quote.status)} label={t(`status.${quote.status}`)} />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">{t("total")}</dt>
                <dd>
                  <span className="font-medium">{money(quote.totalPaise)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    ({t("inclGst", { tax: money(quote.taxPaise) })})
                  </span>
                </dd>
                <dt className="text-muted-foreground">{t("payNow")}</dt>
                <dd>
                  {money(quote.payNowPaise)}
                  {quote.payNowPaise < quote.totalPaise ? (
                    <span className="text-muted-foreground"> · {t("advance")}</span>
                  ) : null}
                </dd>
                {quote.status === "draft" || quote.status === "sent" ? (
                  <>
                    <dt className="text-muted-foreground">{t("validUntil")}</dt>
                    <dd>{when(quote.validUntil)}</dd>
                  </>
                ) : null}
                {quote.bookingCode ? (
                  <>
                    <dt className="text-muted-foreground">{t("booking")}</dt>
                    <dd>{bookingLink(quote.bookingId, quote.bookingCode)}</dd>
                  </>
                ) : null}
              </dl>
              <details className="text-xs">
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-primary">
                  {t("lines", { count: quote.lines.length })}
                </summary>
                <ul className="space-y-1 pt-1">
                  {quote.lines.map((l) => (
                    <li key={l.key} className="flex justify-between gap-3">
                      <span className="min-w-0 break-words">
                        {l.description} × {l.quantity}
                        <span className="text-muted-foreground">
                          {" "}
                          · {l.tax_rate_bps / 100}% · SAC {l.sac}
                        </span>
                      </span>
                      <span className="shrink-0">{money(l.amount_paise + l.tax_paise)}</span>
                    </li>
                  ))}
                </ul>
              </details>
              <div className="flex flex-wrap gap-2">
                {quote.status === "sent" && quote.pageUrl ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => copyText(quote.pageUrl ?? "", t("copied"))}
                    >
                      <Copy /> {t("copyQuoteLink")}
                    </Button>
                    <Button asChild variant="ghost">
                      <a href={quote.pageUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> {t("openQuote")}
                      </a>
                    </Button>
                  </>
                ) : null}
                {quote.status === "sent" && quote.paymentLinkUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyText(quote.paymentLinkUrl ?? "", t("copied"))}
                  >
                    <Copy /> {t("copyPayLink")}
                  </Button>
                ) : null}
                {actions.includes("edit") ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setEditing({ mode: "edit", quote })}
                  >
                    <Pencil /> {t("edit")}
                  </Button>
                ) : null}
                {actions.includes("send") ? (
                  <Button type="button" disabled={pending} onClick={() => send(quote)}>
                    <Send /> {t("send")}
                  </Button>
                ) : null}
                {actions.includes("recordPayment") ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setPaying(quote)}
                  >
                    <HandCoins /> {t("recordPayment")}
                  </Button>
                ) : null}
                {actions.includes("withdraw") ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive"
                    disabled={pending}
                    onClick={() => withdraw(quote)}
                  >
                    <Ban /> {t("withdraw")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {editing ? (
        <QuoteBuilder
          key={editing.mode === "edit" ? editing.quote.id : "new"}
          defaultValues={quoteFormDefaults(
            leadId,
            settings,
            editing.mode === "edit" ? editing.quote : undefined,
            defaultTitle,
          )}
          settings={settings}
          onClose={() => setEditing(null)}
          onSent={setSent}
        />
      ) : canWrite && leadOpen ? (
        <Button type="button" variant="outline" onClick={() => setEditing({ mode: "new" })}>
          <FilePlus2 /> {t("newQuote")}
        </Button>
      ) : !leadOpen && !paid ? (
        <p className="text-sm text-muted-foreground">{t("closedNote")}</p>
      ) : null}

      <LeadSheet
        open={paying !== null}
        onClose={() => setPaying(null)}
        title={t("payment.title")}
        lead={
          paying
            ? t("payment.lead", { total: money(paying.totalPaise), payNow: money(paying.payNowPaise) })
            : undefined
        }
      >
        {paying ? (
          <PaymentForm
            quote={paying}
            pending={pending}
            onSubmit={(values, onFieldError) =>
              run(recordQuotePayment, values, {
                success: t("payment.recorded"),
                onDone: () => setPaying(null),
                onError: onFieldError,
              })
            }
          />
        ) : null}
      </LeadSheet>
    </div>
  );
}

function PaymentForm({
  quote,
  pending,
  onSubmit,
}: {
  quote: QuoteView;
  pending: boolean;
  onSubmit: (
    values: QuoteOfflinePaymentInput,
    onError: (r: { error: string; field?: string }) => void,
  ) => void;
}) {
  const t = useTranslations("leadsAdmin");
  const errorText = useLeadsErrorText();
  const form = useForm<QuoteOfflinePaymentInput>({
    resolver: zodResolver(quoteOfflinePaymentSchema, undefined, { raw: true }),
    defaultValues: {
      quoteId: quote.id,
      amount: paiseToRupeesInput(quote.payNowPaise),
      method: "upi",
      reference: "",
    },
  });
  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="grid gap-4"
        onSubmit={form.handleSubmit(
          (values) =>
            onSubmit(values, (r) => {
              if (r.field)
                form.setError(r.field as Path<QuoteOfflinePaymentInput>, { message: errorText(r.error) });
            }),
          () => toast.error(t("errors.invalid")),
        )}
      >
        <TextInputField<QuoteOfflinePaymentInput>
          name="amount"
          label={t("quotes.payment.amount")}
          help={t("quotes.payment.amountHelp")}
        />
        <SelectField<QuoteOfflinePaymentInput>
          name="method"
          label={t("quotes.payment.method")}
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`quotes.payment.methods.${m}`) }))}
        />
        <TextInputField<QuoteOfflinePaymentInput>
          name="reference"
          label={t("quotes.payment.reference")}
          help={t("quotes.payment.referenceHelp")}
        />
        <Button type="submit" disabled={pending}>
          {t("quotes.payment.submit")}
        </Button>
      </form>
    </FormProvider>
  );
}
