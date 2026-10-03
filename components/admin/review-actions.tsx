"use client";

import { Ban, CheckCheck, MessageSquareReply } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { moderateReview, replyToReview, type ReviewActionResult } from "@/lib/reviews/admin-actions";
import { REVIEW_NOTE_MAX, REVIEW_REPLY_MAX, type ReviewStatus } from "@/schemas/reviews";
import { ActionSheet, SheetForm } from "./action-sheet";

/** Error keys from the review actions → text (reviewsAdmin.errors, then cms.errors). */
function useErrorText() {
  const t = useTranslations("reviewsAdmin.errors");
  const cms = useTranslations("cms.errors");
  return (key: string) => (t.has(key) ? t(key) : cms.has(key) ? cms(key) : t("actionFailed"));
}

function useRun() {
  const router = useRouter();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const run = (
    action: (input: unknown) => Promise<ReviewActionResult>,
    input: unknown,
    success: string,
    after?: () => void,
    onError?: (result: { error: string; field?: string }) => void,
  ) =>
    startTransition(async () => {
      const result = await action(input);
      if (result.ok) {
        toast.success(success);
        after?.();
        router.refresh();
        return;
      }
      onError?.(result);
      toast.error(errorText(result.error));
    });
  return { pending, run };
}

/** Publish / reject (a note the customer sees is required) for one review. */
export function ReviewModeration({ id, status }: { id: string; status: ReviewStatus }) {
  const t = useTranslations("reviewsAdmin.actions");
  const errorText = useErrorText();
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const noteId = useId();
  const form = useForm<{ note: string }>({ defaultValues: { note: "" } });
  const noteError = form.formState.errors.note?.message;

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "published" ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() => run(moderateReview, { id, status: "published", note: "" }, t("published"))}
        >
          <CheckCheck /> {t("publish")}
        </Button>
      ) : null}
      {status !== "rejected" ? (
        <Button
          type="button"
          variant="outline"
          className="text-destructive"
          disabled={pending}
          onClick={() => setOpen(true)}
        >
          <Ban /> {status === "published" ? t("unpublish") : t("reject")}
        </Button>
      ) : null}
      <ActionSheet open={open} onClose={() => setOpen(false)} title={t("rejectTitle")} lead={t("rejectLead")}>
        <SheetForm
          form={form}
          pending={pending}
          destructive
          submitLabel={t("confirmReject")}
          onSubmit={(values) => {
            if (!values.note.trim()) {
              form.setError("note", { message: "reasonRequired" });
              return;
            }
            run(
              moderateReview,
              { id, status: "rejected", note: values.note },
              t("rejected"),
              () => setOpen(false),
              (r) => r.field === "note" && form.setError("note", { message: r.error }),
            );
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={noteId}>{t("reason")}</Label>
            <Textarea
              id={noteId}
              rows={4}
              maxLength={REVIEW_NOTE_MAX}
              aria-invalid={!!noteError}
              {...form.register("note")}
            />
            <p className="text-xs text-muted-foreground">{t("reasonHelp")}</p>
            {noteError ? <p className="text-sm text-destructive">{errorText(noteError)}</p> : null}
          </div>
        </SheetForm>
      </ActionSheet>
    </div>
  );
}

/** The public reply: write, edit or remove (save it empty). */
export function ReviewReplyForm({ id, reply }: { id: string; reply: string | null }) {
  const t = useTranslations("reviewsAdmin.actions");
  const { pending, run } = useRun();
  const fieldId = useId();
  const [value, setValue] = useState(reply ?? "");
  const changed = value.trim() !== (reply ?? "").trim();
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(replyToReview, { id, reply: value }, value.trim() ? t("replySaved") : t("replyRemoved"));
      }}
    >
      <Label htmlFor={fieldId}>{t("reply")}</Label>
      <Textarea
        id={fieldId}
        rows={4}
        maxLength={REVIEW_REPLY_MAX}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("replyPlaceholder")}
      />
      <p className="text-xs text-muted-foreground">{t("replyHelp")}</p>
      <Button type="submit" variant="secondary" disabled={pending || !changed} className="justify-self-start">
        <MessageSquareReply /> {reply ? t("updateReply") : t("saveReply")}
      </Button>
    </form>
  );
}
