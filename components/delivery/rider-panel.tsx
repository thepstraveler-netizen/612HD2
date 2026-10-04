"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { StickyActionBar } from "@/components/booking/sticky-action-bar";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { riderStep } from "@/lib/delivery/rider-actions";
import type { RiderAction } from "@/lib/delivery/vendor-ui";

/**
 * The rider's next step as one big button: "Picked up — out for delivery",
 * then "Delivered", which asks for the customer's 4-digit OTP when the
 * settings require it.
 */
export function RiderPanel({ token, actions }: { token: string; actions: RiderAction[] }) {
  const t = useTranslations("rider");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (action: RiderAction) =>
    start(async () => {
      setError(null);
      const result = await riderStep({
        token,
        status: action.status,
        otp: action.needsOtp ? otp : undefined,
      });
      if (result.ok) {
        toast.success(t(`done.${action.status}`));
        setOtp("");
        router.refresh();
        return;
      }
      setError(t(`errors.${result.error}`));
      if (result.error === "invalid_transition" || result.error === "not_found") router.refresh();
    });

  return (
    <StickyActionBar label={t("nextStep")} innerClassName="space-y-2">
      {actions.map((action) => (
        <div key={action.status} className="space-y-2">
          {action.needsOtp ? (
            <div className="space-y-1.5">
              <label htmlFor="rider-otp" className="block text-sm font-semibold">
                {t("otpLabel")}
              </label>
              <input
                id="rider-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{4}"
                maxLength={4}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                aria-describedby="rider-otp-hint"
                aria-invalid={error ? true : undefined}
                className="h-16 w-full rounded-xl border-2 border-input bg-background text-center font-mono text-3xl font-bold tracking-[0.5em] focus-visible:border-primary focus-visible:outline-none"
              />
              <p id="rider-otp-hint" className="text-xs text-muted-foreground">
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

      <p aria-live="assertive" className="empty:hidden">
        {error ? (
          <span className="block rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
            {error}
          </span>
        ) : null}
      </p>
    </StickyActionBar>
  );
}
