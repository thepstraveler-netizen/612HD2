"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { StickyActionBar } from "@/components/booking/sticky-action-bar";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { driverStep } from "@/lib/cabs/actions";
import type { DriverAction } from "@/lib/cabs/ui";

/**
 * The driver's next step as one big button (Start trip → Arrived → Picked
 * up → Complete). Picking up asks for the customer's 4-digit OTP; a
 * no-show needs a second tap to confirm.
 */
export function DriverStepPanel({ token, actions }: { token: string; actions: DriverAction[] }) {
  const t = useTranslations("driverTrip");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmNoShow, setConfirmNoShow] = useState(false);

  const run = (action: DriverAction) =>
    start(async () => {
      setError(null);
      const result = await driverStep({
        token,
        status: action.status,
        otp: action.needsOtp ? otp : undefined,
      });
      if (result.ok) {
        toast.success(t(`done.${action.status}`));
        setOtp("");
        setConfirmNoShow(false);
        router.refresh();
        return;
      }
      setError(t(`errors.${result.error}`));
      if (result.error === "invalid_transition" || result.error === "not_found") router.refresh();
    });

  const primary = actions.filter((a) => a.primary);
  const noShow = actions.find((a) => a.status === "no_show");

  return (
    <>
      {primary.length || error ? (
        <StickyActionBar label={t("nextStep")} innerClassName="space-y-2">
          {primary.map((action) => (
            <div key={action.status} className="space-y-2">
              {action.needsOtp ? (
                <div className="space-y-1.5">
                  <label htmlFor="driver-otp" className="block text-sm font-semibold">
                    {t("otpLabel")}
                  </label>
                  <input
                    id="driver-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    aria-describedby="driver-otp-hint"
                    aria-invalid={error ? true : undefined}
                    className="h-16 w-full rounded-xl border-2 border-input bg-background text-center font-mono text-3xl font-bold tracking-[0.5em] focus-visible:border-primary focus-visible:outline-none"
                  />
                  <p id="driver-otp-hint" className="text-xs text-muted-foreground">
                    {t("otpHint")}
                  </p>
                </div>
              ) : null}
              <Button
                type="button"
                size="lg"
                className="h-16 w-full text-lg font-bold"
                disabled={pending || (action.needsOtp && otp.length !== 4)}
                onClick={() => run(action)}
              >
                {pending ? <Loader2 className="animate-spin" /> : null} {t(`actions.${action.status}`)}
              </Button>
            </div>
          ))}

          {error ? (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </StickyActionBar>
      ) : null}

      {noShow ? (
        confirmNoShow ? (
          <div
            role="alertdialog"
            aria-labelledby="no-show-title"
            className="space-y-3 rounded-2xl border border-destructive/40 p-4"
          >
            <p id="no-show-title" className="font-semibold">
              {t("noShowConfirm")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="destructive"
                size="lg"
                disabled={pending}
                onClick={() => run(noShow)}
              >
                {t("actions.no_show")}
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={() => setConfirmNoShow(false)}>
                {t("back")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-full"
            disabled={pending}
            onClick={() => setConfirmNoShow(true)}
          >
            {t("actions.no_show")}
          </Button>
        )
      ) : null}
    </>
  );
}
