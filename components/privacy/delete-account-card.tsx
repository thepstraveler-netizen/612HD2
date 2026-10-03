"use client";

import { AlertTriangle, Loader2, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { cancelAccountDeletion, requestAccountDeletion, type PrivacyResult } from "@/lib/privacy/actions";
import { deletionRequestSchema } from "@/schemas/privacy";

type Pending = { createdAt: string; reason: string | null } | null;

/**
 * "Delete my account": open bookings that hold it up, then a reason and an
 * explicit confirm step. A pending request shows with a cancel button.
 */
export function DeleteAccountCard({
  blockers,
  pending,
  requestedOn,
}: {
  blockers: number;
  pending: Pending;
  /** The pending request's date, formatted by the server. */
  requestedOn: string | null;
}) {
  const t = useTranslations("privacy.delete");
  const router = useRouter();
  const id = useId();
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, start] = useTransition();

  const show = (result: PrivacyResult, success: string) => {
    if (result.ok) {
      toast.success(success);
      router.refresh();
      return true;
    }
    toast.error(t(`errors.${result.error}`));
    return false;
  };

  if (pending) {
    return (
      <div className="grid gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4" role="status">
        <p className="font-medium">{t("pendingTitle")}</p>
        <p className="text-sm">{t("pendingBody", { date: requestedOn ?? "" })}</p>
        {pending.reason ? (
          <p className="text-sm text-muted-foreground">
            {t("yourReason")} {pending.reason}
          </p>
        ) : null}
        {blockers > 0 ? <p className="text-sm">{t("blockers", { count: blockers })}</p> : null}
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => start(async () => void show(await cancelAccountDeletion(), t("cancelled")))}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Undo2 />} {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
        <li>{t("whatGoes")}</li>
        <li>{t("whatStays")}</li>
        <li>{t("howLong")}</li>
      </ul>
      {blockers > 0 ? (
        <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
          {t("blockers", { count: blockers })}
        </p>
      ) : null}
      {step === "idle" ? (
        <div>
          <Button type="button" variant="destructive" className="h-11" onClick={() => setStep("confirm")}>
            <Trash2 /> {t("button")}
          </Button>
        </div>
      ) : (
        <form
          className="grid gap-3 rounded-xl border border-destructive/40 p-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = deletionRequestSchema.safeParse({ reason, confirm: understood });
            if (!parsed.success) {
              toast.error(t("errors.invalid"));
              return;
            }
            start(async () => {
              if (show(await requestAccountDeletion(parsed.data), t("requested"))) setStep("idle");
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-reason`}>{t("reason")}</Label>
            <Textarea
              id={`${id}-reason`}
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
            />
          </div>
          <label htmlFor={`${id}-ok`} className="flex items-start gap-2 text-sm">
            <input
              id={`${id}-ok`}
              type="checkbox"
              className="mt-0.5 size-4 accent-destructive"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
            {t("understand")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" disabled={busy || !understood}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} {t("confirm")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("idle")} disabled={busy}>
              {t("back")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
