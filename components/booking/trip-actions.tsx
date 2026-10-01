"use client";

import { Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { cancelMyBooking, resumeHotelPayment, verifyHotelPayment } from "@/lib/bookings/actions";
import { formatPaise } from "@/lib/money";
import { openRazorpay } from "@/lib/payments/checkout-client";

/** Pay for a held booking, or cancel a confirmed one after seeing the refund. */
export function TripActions({
  code,
  locale,
  canPay,
  cancel,
  description,
}: {
  code: string;
  locale: string;
  canPay: boolean;
  cancel: { refundPaise: number; chargePaise: number } | null;
  description: string;
}) {
  const t = useTranslations("trips");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const pay = () =>
    start(async () => {
      const result = await resumeHotelPayment({ code });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        router.refresh();
        return;
      }
      const opened = await openRazorpay({
        order: result.order,
        prefill: result.prefill,
        description,
        bookingCode: code,
        onSuccess: (response) =>
          start(async () => {
            const verified = await verifyHotelPayment({ bookingCode: code, ...response });
            if (!verified.ok) toast.error(t("errors.verify"));
            router.refresh();
          }),
        onDismiss: () => undefined,
      });
      if (!opened) toast.error(t("errors.payment"));
    });

  const doCancel = () =>
    start(async () => {
      const result = await cancelMyBooking({ code });
      setConfirming(false);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(
        result.refundPaise > 0
          ? t("cancelledWithRefund", { amount: formatPaise(result.refundPaise, locale) })
          : t("cancelled"),
      );
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {canPay ? (
        <Button size="lg" className="w-full sm:w-auto" onClick={pay} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} {t("payNow")}
        </Button>
      ) : null}
      {cancel ? (
        confirming ? (
          <div
            role="alertdialog"
            aria-labelledby="cancel-title"
            className="space-y-3 rounded-2xl border border-destructive/40 p-4 text-sm"
          >
            <p id="cancel-title" className="font-semibold">
              {t("cancelConfirmTitle")}
            </p>
            <p>
              {cancel.refundPaise > 0
                ? t("cancelRefund", { amount: formatPaise(cancel.refundPaise, locale) })
                : t("cancelNoRefund")}
            </p>
            {cancel.chargePaise > 0 ? (
              <p className="text-muted-foreground">
                {t("cancelCharge", { amount: formatPaise(cancel.chargePaise, locale) })}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" onClick={doCancel} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} {t("cancelConfirm")}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
                {t("keepBooking")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            <XCircle /> {t("cancelBooking")}
          </Button>
        )
      ) : null}
    </div>
  );
}
