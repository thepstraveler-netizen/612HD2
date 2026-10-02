"use client";

import { Banknote, CheckCircle2, CreditCard, Loader2, Lock, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import {
  acceptQuote,
  declineQuote,
  verifyOrderPayment,
  type AcceptQuoteResult,
} from "@/lib/delivery/actions";
import { formatPaise } from "@/lib/money";
import { openRazorpay } from "@/lib/payments/checkout-client";
import { cn } from "@/lib/utils";
import type { OrderPaymentMode } from "@/schemas/delivery";

type PendingOrder = Extract<AcceptQuoteResult, { ok: true; status: "pending_payment" }>;

/** Accept a pharmacy's quote (cash on delivery, or online through Razorpay) or decline it. */
export function QuoteActions({
  quoteId,
  locale,
  payModes,
  totals,
  convenienceFeePaise,
  description,
}: {
  quoteId: string;
  locale: "en" | "hi";
  payModes: OrderPaymentMode[];
  totals: Record<OrderPaymentMode, number>;
  convenienceFeePaise: number;
  description: string;
}) {
  const t = useTranslations("medicine.quote");
  const tc = useTranslations("checkout");
  const router = useRouter();
  const [pay, setPay] = useState<OrderPaymentMode>(payModes.includes("cod") ? "cod" : (payModes[0] ?? "cod"));
  const [pending, start] = useTransition();
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const money = (paise: number) => formatPaise(paise, locale);

  async function openPayment(order: PendingOrder) {
    const opened = await openRazorpay({
      order: order.order,
      prefill: order.prefill,
      description: `${description} · ${order.code}`,
      bookingCode: order.code,
      onSuccess: (response) =>
        start(async () => {
          const result = await verifyOrderPayment({ bookingCode: order.code, ...response });
          setPendingOrder(null);
          if (!result.ok) toast.error(tc("paymentNotVerified"));
          else toast.success(t("paid"));
          router.push(`/account/trips/${order.code}`);
        }),
      onDismiss: () => setPendingOrder(order),
    });
    if (!opened) {
      toast.error(tc("errors.payment_failed"));
      setPendingOrder(order);
    }
  }

  const accept = () =>
    start(async () => {
      const result = await acceptQuote({ quoteId, pay, locale });
      if (!result.ok) {
        toast.error(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.unknown"));
        if (result.error === "expired" || result.error === "not_found") router.refresh();
        return;
      }
      if (result.status === "confirmed") {
        toast.success(t("accepted", { code: result.code }));
        router.push(`/account/trips/${result.code}`);
        return;
      }
      setPendingOrder(result);
      await openPayment(result);
    });

  const decline = () =>
    start(async () => {
      const result = await declineQuote({ quoteId });
      setConfirmDecline(false);
      if (!result.ok) toast.error(t("errors.unknown"));
      else toast.success(t("declined"));
      router.refresh();
    });

  if (pendingOrder) {
    return (
      <div
        role="status"
        className="space-y-3 rounded-2xl border border-accent-orange bg-accent-orange/10 p-4 text-sm"
      >
        <p className="font-semibold">{tc("paymentPending", { code: pendingOrder.code })}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => openPayment(pendingOrder)} disabled={pending}>
            {tc("retryPayment")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/account/trips/${pendingOrder.code}`)}
          >
            {t("viewOrder")}
          </Button>
        </div>
      </div>
    );
  }

  if (payModes.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noPayMode")}</p>;
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 font-semibold">{tc("paymentTitle")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {payModes.map((m) => {
            const Icon = m === "online" ? CreditCard : Banknote;
            return (
              <label
                key={m}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                  pay === m && "border-primary ring-1 ring-primary",
                )}
              >
                <input
                  type="radio"
                  name="quote-pay"
                  className="mt-0.5 size-5 accent-[var(--primary)]"
                  checked={pay === m}
                  onChange={() => setPay(m)}
                />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Icon className="size-4" aria-hidden="true" /> {t(`modes.${m}`)} · {money(totals[m])}
                  </span>
                  {m === "online" && convenienceFeePaise > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      {t("feeNote", { amount: money(convenienceFeePaise) })}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {confirmDecline ? (
        <div
          role="alertdialog"
          aria-labelledby="decline-title"
          className="space-y-3 rounded-2xl border border-destructive/40 p-4 text-sm"
        >
          <p id="decline-title" className="font-semibold">
            {t("declineConfirm")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" onClick={decline} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} {t("decline")}
            </Button>
            <Button variant="outline" onClick={() => setConfirmDecline(false)} disabled={pending}>
              {t("keep")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={accept} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : pay === "online" ? <Lock /> : <CheckCircle2 />}{" "}
            {pay === "online" ? tc("payNow", { amount: money(totals.online) }) : t("acceptCod")}
          </Button>
          <Button size="lg" variant="outline" onClick={() => setConfirmDecline(true)} disabled={pending}>
            <XCircle /> {t("decline")}
          </Button>
        </div>
      )}
    </div>
  );
}
