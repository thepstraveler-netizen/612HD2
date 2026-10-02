"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { rideDriverStep } from "@/lib/rides/actions";
import type { RideDriverAction } from "@/lib/rides/ui";

/**
 * The driver's next ride step as big buttons (On my way → Arrived → Picked
 * up → Completed). Picking up asks for the rider's 4-digit OTP when the
 * settings require it; a no-show needs a second tap.
 */
export function RideDriverPanel({ token, actions }: { token: string; actions: RideDriverAction[] }) {
  const t = useTranslations("rides.driver");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmNoShow, setConfirmNoShow] = useState(false);

  const run = (action: RideDriverAction) =>
    start(async () => {
      setError(null);
      const result = await rideDriverStep({
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
    <section aria-label={t("nextStep")} className="space-y-3">
      {primary.map((action, i) => (
        <div key={action.status} className="space-y-3">
          {action.needsOtp ? (
            <div className="space-y-1.5">
              <label htmlFor="ride-otp" className="block text-sm font-semibold">
                {t("otpLabel")}
              </label>
              <input
                id="ride-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{4}"
                maxLength={4}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                aria-describedby="ride-otp-hint"
                aria-invalid={error ? true : undefined}
                className="h-16 w-full rounded-xl border-2 border-input bg-background text-center font-mono text-3xl font-bold tracking-[0.5em] focus-visible:border-primary focus-visible:outline-none"
              />
              <p id="ride-otp-hint" className="text-xs text-muted-foreground">
                {t("otpHint")}
              </p>
            </div>
          ) : null}
          <Button
            type="button"
            size="lg"
            variant={i === 0 ? "default" : "outline"}
            className="h-16 w-full text-lg font-bold"
            disabled={pending || (action.needsOtp && otp.length !== 4)}
            onClick={() => run(action)}
          >
            {pending ? <Loader2 className="animate-spin" /> : null} {t(`actions.${action.status}`)}
          </Button>
        </div>
      ))}

      <p aria-live="assertive" className="empty:hidden">
        {error ? (
          <span className="block rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
            {error}
          </span>
        ) : null}
      </p>

      {noShow ? (
        confirmNoShow ? (
          <div
            role="alertdialog"
            aria-labelledby="ride-no-show-title"
            className="space-y-3 rounded-2xl border border-destructive/40 p-4"
          >
            <p id="ride-no-show-title" className="font-semibold">
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
    </section>
  );
}
