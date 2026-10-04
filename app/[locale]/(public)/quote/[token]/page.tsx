import { CheckCircle2, Clock, CreditCard, FileText, MessageCircle, Phone, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MobilePayBar } from "@/components/booking/mobile-pay-bar";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { getQuoteByToken } from "@/lib/leads/quote-page";
import { formatPaise } from "@/lib/money";
import { quotePageState } from "@/lib/packages/ui";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string; token: string }> };

// The payment link returns here after paying: always read the latest state.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "quotePage" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * The no-login quote page an agent sends (/quote/<token>): lines with GST,
 * totals, what to pay now, and the Razorpay Payment Link while the quote
 * is open. The token is the only credential.
 */
export default async function QuotePage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const [quote, business] = await Promise.all([getQuoteByToken(token), getBusinessInfo()]);
  if (!quote) notFound();
  const t = await getTranslations("quotePage");
  const tc = await getTranslations("checkout");
  const money = (paise: number) => formatPaise(paise, locale);
  const state = quotePageState(quote.status);
  const validUntil = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(quote.validUntil));
  const whatsapp = business.whatsapp.replace(/[^0-9]/g, "");
  const phone = business.phone.replace(/[^0-9+]/g, "");
  const whatsappText = t("whatsappText", { reference: quote.reference, number: quote.number });
  const balance = Math.max(0, quote.totalPaise - quote.payNowPaise);

  const contact = (
    <div className="flex flex-wrap gap-2">
      {whatsapp ? (
        <Button asChild variant="outline">
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(whatsappText)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle /> {t("whatsapp")}
          </a>
        </Button>
      ) : null}
      {phone ? (
        <Button asChild variant="outline">
          <a href={`tel:${phone}`}>
            <Phone /> {t("call")}
          </a>
        </Button>
      ) : null}
    </div>
  );

  const banner =
    state === "paid" ? (
      <section
        data-testid="quote-state"
        className="space-y-2 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-4"
      >
        <p className="flex items-center gap-2 font-bold">
          <CheckCircle2 className="size-6 shrink-0 text-accent-green" aria-hidden="true" /> {t("paid.title")}
        </p>
        <p className="text-sm">{t("paid.amount", { amount: money(quote.paidPaise) })}</p>
        {quote.bookingCode ? (
          <p className="text-sm">
            {t("paid.booking")} <span className="font-mono font-bold">{quote.bookingCode}</span>
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {quote.paidPaise < quote.totalPaise
            ? t("paid.balance", { amount: money(quote.totalPaise - quote.paidPaise) })
            : t("paid.full")}
        </p>
        {quote.bookingCode ? (
          <Button asChild variant="outline">
            <Link href={`/account/trips/${quote.bookingCode}`}>{t("paid.viewTrip")}</Link>
          </Button>
        ) : null}
      </section>
    ) : state === "payable" ? (
      <section
        data-testid="quote-state"
        className="space-y-3 rounded-2xl border-2 border-primary bg-card p-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {quote.payNowPaise < quote.totalPaise ? t("payable.advance") : t("payable.full")}
            </p>
            <p className="text-3xl font-extrabold">{money(quote.payNowPaise)}</p>
            {balance > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("payable.balance", { amount: money(balance) })}
              </p>
            ) : null}
          </div>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden="true" /> {t("payable.validUntil", { date: validUntil })}
          </p>
        </div>
        {quote.payUrl ? (
          <Button asChild size="lg" className="w-full sm:w-auto">
            <a href={quote.payUrl} rel="noreferrer">
              <CreditCard /> {t("payable.pay", { amount: money(quote.payNowPaise) })}
            </a>
          </Button>
        ) : (
          <p className="rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">
            {t("payable.manual")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("payable.secure")}</p>
      </section>
    ) : (
      <section data-testid="quote-state" className="space-y-3 rounded-2xl border bg-secondary p-4">
        <p className="flex items-center gap-2 font-bold">
          <XCircle className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
          {t(`${state}.title`)}
        </p>
        <p className="text-sm text-muted-foreground">{t(`${state}.body`)}</p>
        {contact}
      </section>
    );

  const payBar = state === "payable" && Boolean(quote.payUrl);

  return (
    <div className={cn("mx-auto max-w-3xl space-y-6 px-4 py-8", payBar && "pb-32 lg:pb-8")}>
      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <FileText className="size-4" aria-hidden="true" />
          {t("reference", { reference: quote.reference, number: quote.number })}
        </p>
        <h1 className="text-[length:var(--text-title)] leading-tight font-extrabold">{quote.title}</h1>
        <p className="text-sm">{t("preparedFor", { name: quote.customerName })}</p>
      </header>

      {banner}

      <section aria-labelledby="quote-lines" className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 id="quote-lines" className="text-base font-bold">
          {t("linesTitle")}
        </h2>
        <ul className="divide-y text-sm">
          {quote.lines.map((line) => (
            <li key={line.key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{line.description}</p>
                <p className="text-xs text-muted-foreground">
                  {t("lineMeta", {
                    quantity: line.quantity,
                    unit: money(line.unit_price_paise),
                    gst: (line.tax_rate_bps / 100).toString(),
                    tax: money(line.tax_paise),
                  })}
                </p>
              </div>
              <p className="shrink-0 text-right font-semibold">{money(line.amount_paise)}</p>
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 border-t pt-3 text-sm">
          <dt>{t("subtotal")}</dt>
          <dd className="text-right">{money(quote.subtotalPaise)}</dd>
          <dt>{t("gst")}</dt>
          <dd className="text-right">{money(quote.taxPaise)}</dd>
          <dt className="border-t pt-2 font-bold">{t("total")}</dt>
          <dd className="border-t pt-2 text-right text-lg font-extrabold">{money(quote.totalPaise)}</dd>
          {state === "payable" && quote.payNowPaise < quote.totalPaise ? (
            <>
              <dt className="font-semibold text-primary">{t("payNow")}</dt>
              <dd className="text-right font-semibold text-primary">{money(quote.payNowPaise)}</dd>
            </>
          ) : null}
        </dl>
      </section>

      {quote.notes ? (
        <section aria-labelledby="quote-notes" className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
          <h2 id="quote-notes" className="text-base font-bold">
            {t("notes")}
          </h2>
          <p className="whitespace-pre-line">{quote.notes}</p>
        </section>
      ) : null}
      {quote.terms ? (
        <section aria-labelledby="quote-terms" className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
          <h2 id="quote-terms" className="text-base font-bold">
            {t("terms")}
          </h2>
          <p className="whitespace-pre-line text-muted-foreground">{quote.terms}</p>
        </section>
      ) : null}

      {state === "payable" || state === "paid" ? (
        <section className="space-y-2 text-sm">
          <p className="text-muted-foreground">{t("questions")}</p>
          {contact}
        </section>
      ) : null}

      {payBar && quote.payUrl ? (
        <MobilePayBar
          label={quote.payNowPaise < quote.totalPaise ? t("payable.advance") : t("payable.full")}
          amount={money(quote.payNowPaise)}
        >
          <Button asChild size="lg">
            <a href={quote.payUrl} rel="noreferrer">
              <CreditCard /> {tc("pay")}
            </a>
          </Button>
        </MobilePayBar>
      ) : null}
    </div>
  );
}
