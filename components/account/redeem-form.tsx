"use client";

import { Gift, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { redeemPoints, type RedeemResult } from "@/lib/loyalty/actions";
import { pointsToPaise, redeemBounds, validateRedeem, type LoyaltySettings } from "@/lib/loyalty/rules";
import { formatPaise } from "@/lib/money";
import { CopyButton } from "./copy-button";

type Issued = Extract<RedeemResult, { ok: true }>;

/** Points → reward code, with a live "= ₹X off" preview. The server re-checks everything. */
export function RedeemForm({
  balance,
  settings,
  locale,
}: {
  balance: number;
  settings: Pick<
    LoyaltySettings,
    "enabled" | "point_value_paise" | "min_redeem_points" | "max_redeem_points"
  >;
  locale: string;
}) {
  const t = useTranslations("rewards");
  const router = useRouter();
  const id = useId();
  const bounds = redeemBounds(balance, settings);
  const [value, setValue] = useState(bounds.canRedeem ? String(bounds.max) : "");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [pending, startTransition] = useTransition();
  const points = Number(value);
  const validPoints = Number.isInteger(points) && points > 0;
  const dateFormat = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const errorMessage = (key: string) =>
    t(`errors.${key}`, {
      min: settings.min_redeem_points,
      max: settings.max_redeem_points ?? balance,
      balance,
    });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const precheck = validateRedeem(points, balance, settings);
    if (precheck) {
      setError(errorMessage(precheck));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await redeemPoints({ points });
      if (result.ok) {
        setIssued(result);
        toast.success(t("issuedToast"));
        router.refresh();
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  if (!bounds.canRedeem) {
    return (
      <p className="rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
        {t("notEnough", { min: settings.min_redeem_points })}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <label htmlFor={`${id}-points`} className="text-sm font-medium">
          {t("redeemLabel")}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1 space-y-1">
            <Input
              id={`${id}-points`}
              type="number"
              inputMode="numeric"
              min={bounds.min}
              max={bounds.max}
              step={bounds.step}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-describedby={`${id}-hint ${id}-preview${error ? ` ${id}-error` : ""}`}
              aria-invalid={error ? true : undefined}
            />
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {t("redeemHint", { min: bounds.min, max: bounds.max })}
            </p>
          </div>
          <Button type="submit" disabled={pending || !validPoints}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Gift aria-hidden="true" />}
            {pending ? t("redeeming") : t("redeemCta")}
          </Button>
        </div>
        <p id={`${id}-preview`} className="text-lg font-bold text-heading" aria-live="polite">
          {validPoints ? t("preview", { amount: formatPaise(pointsToPaise(points, settings), locale) }) : " "}
        </p>
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
      {issued ? (
        <div
          role="status"
          className="space-y-2 rounded-2xl border-2 border-dashed border-primary bg-secondary p-4 text-secondary-foreground"
        >
          <p className="text-sm font-semibold">{t("newCode")}</p>
          <p className="font-mono text-2xl font-extrabold tracking-widest">{issued.code}</p>
          <p className="text-sm">
            {issued.endsAt
              ? t("newCodeBody", {
                  amount: formatPaise(issued.valuePaise, locale),
                  date: dateFormat.format(new Date(issued.endsAt)),
                })
              : t("codeValue", { amount: formatPaise(issued.valuePaise, locale) })}
          </p>
          <CopyButton value={issued.code} label={t("copy")} />
        </div>
      ) : null}
    </div>
  );
}
