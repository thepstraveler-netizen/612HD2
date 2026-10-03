"use client";

import { Loader2, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ActionSheet } from "@/components/admin/action-sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";
import { completeAccountDeletion, rejectPrivacyRequest } from "@/lib/privacy/admin-actions";
import { rejectPrivacyRequestSchema } from "@/schemas/privacy";

/**
 * Admin → Customers → Privacy requests: delete the account (refused while it
 * has open bookings) or reject the request with a reason. customers.write.
 */
export function PrivacyRequestActions({ id, who, blockers }: { id: string; who: string; blockers: number }) {
  const t = useTranslations("privacyAdmin");
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState<"delete" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const message = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.saveFailed"));
  const finish = (result: MutationResult, success: string) => {
    if (result.ok) {
      toast.success(success);
      setOpen(null);
      setNote("");
      router.refresh();
      return;
    }
    setError(message(result.error));
    toast.error(message(result.error));
  };
  const close = () => {
    setOpen(null);
    setError(null);
    setNote("");
  };

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={blockers > 0}
        title={blockers > 0 ? t("blockedHint", { count: blockers }) : undefined}
        onClick={() => setOpen("delete")}
      >
        <Trash2 /> {t("delete")}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen("reject")}>
        <X /> {t("reject")}
      </Button>

      <ActionSheet
        open={open !== null}
        onClose={close}
        title={open === "reject" ? t("rejectTitle") : t("deleteTitle")}
        lead={open === "reject" ? t("rejectLead", { who }) : t("deleteLead", { who })}
      >
        <form
          className="mt-4 grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (open === "reject") {
              const parsed = rejectPrivacyRequestSchema.safeParse({ id, note });
              if (!parsed.success) {
                setError(message(parsed.error.issues[0]?.message ?? "invalid"));
                return;
              }
              start(async () => finish(await rejectPrivacyRequest(parsed.data), t("rejected")));
            } else {
              start(async () => finish(await completeAccountDeletion({ id, note }), t("deleted")));
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-note`}>{open === "reject" ? t("reason") : t("note")}</Label>
            <Textarea
              id={`${fieldId}-note`}
              rows={3}
              maxLength={1000}
              value={note}
              aria-invalid={!!error}
              aria-describedby={error ? `${fieldId}-error` : undefined}
              onChange={(e) => setNote(e.target.value)}
            />
            {open === "delete" ? <p className="text-xs text-muted-foreground">{t("deleteExplain")}</p> : null}
            {error ? (
              <p id={`${fieldId}-error`} className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant={open === "reject" ? "default" : "destructive"} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {open === "reject" ? t("rejectSubmit") : t("deleteSubmit")}
            </Button>
          </div>
        </form>
      </ActionSheet>
    </div>
  );
}
