"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Ban, CheckCheck, Eye, ShieldCheck, ShieldX, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm, useFormContext, useFormState, type FieldValues, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import {
  approveApplication,
  reviewApplication,
  reviewVendorDocument,
  type PartnerActionResult,
} from "@/lib/partners/admin-actions";
import { approveApplicationSchema, reviewApplicationSchema } from "@/schemas/partners";
import type { z } from "zod";
import { ActionSheet, SheetForm } from "./action-sheet";
import { TextInputField } from "./form-fields";

/** Error keys from the partner actions → text (vendorsAdmin.errors, then cms.errors). */
export function useVendorsErrorText() {
  const t = useTranslations("vendorsAdmin.errors");
  const cms = useTranslations("cms.errors");
  return (key: string) => (t.has(key) ? t(key) : cms.has(key) ? cms(key) : t("actionFailed"));
}

/** A multi-line text field registered on the surrounding form. */
export function NoteField<T extends FieldValues>({
  name,
  label,
  help,
}: {
  name: Path<T>;
  label: string;
  help?: string;
}) {
  const { register } = useFormContext<T>();
  const { errors } = useFormState<T>();
  const errorText = useVendorsErrorText();
  const message = (errors as Record<string, { message?: string } | undefined>)[name]?.message;
  const id = `f-${name}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={4} aria-invalid={!!message} {...register(name)} />
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      {message ? <p className="text-sm text-destructive">{errorText(message)}</p> : null}
    </div>
  );
}

function useRun() {
  const router = useRouter();
  const errorText = useVendorsErrorText();
  const [pending, startTransition] = useTransition();
  const run = (
    action: (input: unknown) => Promise<PartnerActionResult>,
    input: unknown,
    success: string,
    after?: (result: { ok: true; id?: string }) => void,
    onError?: (result: { error: string; field?: string }) => void,
  ) =>
    startTransition(async () => {
      const result = await action(input);
      if (result.ok) {
        toast.success(success);
        after?.(result);
        router.refresh();
        return;
      }
      onError?.(result);
      toast.error(errorText(result.error));
      router.refresh();
    });
  return { pending, run };
}

type ApproveInput = z.input<typeof approveApplicationSchema>;
type RejectInput = z.input<typeof reviewApplicationSchema>;

/** Mark under review / approve (commission %) / reject (reason) for an open application. */
export function ApplicationActions({
  id,
  status,
  defaultCommissionPercent,
}: {
  id: string;
  status: "submitted" | "under_review";
  defaultCommissionPercent: string;
}) {
  const t = useTranslations("vendorsAdmin.applications.actions");
  const router = useRouter();
  const { pending, run } = useRun();
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);

  const approveForm = useForm<ApproveInput>({
    resolver: zodResolver(approveApplicationSchema, undefined, { raw: true }),
    defaultValues: { id, commissionPercent: defaultCommissionPercent },
  });
  const rejectForm = useForm<RejectInput>({
    resolver: zodResolver(reviewApplicationSchema, undefined, { raw: true }),
    defaultValues: { id, status: "rejected", note: "" },
  });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status === "submitted" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(reviewApplication, { id, status: "under_review" }, t("markedReview"))}
          >
            <Eye /> {t("markReview")}
          </Button>
        ) : null}
        <Button type="button" disabled={pending} onClick={() => setDialog("approve")}>
          <CheckCheck /> {t("approve")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-destructive"
          disabled={pending}
          onClick={() => setDialog("reject")}
        >
          <Ban /> {t("reject")}
        </Button>
      </div>

      <ActionSheet
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        title={t("approveTitle")}
        lead={t("approveLead")}
      >
        <SheetForm
          form={approveForm}
          pending={pending}
          submitLabel={t("confirmApprove")}
          onSubmit={(values) =>
            run(approveApplication, values, t("approved"), (result) => {
              setDialog(null);
              if (result.id) router.push(`/admin/vendors/${result.id}`);
            })
          }
        >
          <TextInputField<ApproveInput>
            name="commissionPercent"
            label={t("commission")}
            help={t("commissionHelp")}
          />
        </SheetForm>
      </ActionSheet>

      <ActionSheet
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title={t("rejectTitle")}
        lead={t("rejectLead")}
      >
        <SheetForm
          form={rejectForm}
          pending={pending}
          destructive
          submitLabel={t("confirmReject")}
          onSubmit={(values) =>
            run(
              reviewApplication,
              values,
              t("rejected"),
              () => setDialog(null),
              (r) => r.field && rejectForm.setError(r.field as Path<RejectInput>, { message: r.error }),
            )
          }
        >
          <NoteField<RejectInput> name="note" label={t("reason")} help={t("reasonHelp")} />
        </SheetForm>
      </ActionSheet>
    </>
  );
}

/** Verify / reject (with a note) / reset one vendor document. */
export function DocumentReview({
  id,
  status,
  note,
}: {
  id: string;
  status: "pending" | "verified" | "rejected";
  note: string | null;
}) {
  const t = useTranslations("vendorsAdmin.documents");
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const form = useForm<{ id: string; status: "rejected"; note: string }>({
    defaultValues: { id, status: "rejected", note: note ?? "" },
  });

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "verified" ? (
        <Button
          type="button"
          size="sm"
          className="h-11 sm:h-9"
          variant="secondary"
          disabled={pending}
          onClick={() => run(reviewVendorDocument, { id, status: "verified", note: "" }, t("verified"))}
        >
          <ShieldCheck /> {t("verify")}
        </Button>
      ) : null}
      {status !== "rejected" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-11 text-destructive sm:h-9"
          disabled={pending}
          onClick={() => setOpen(true)}
        >
          <ShieldX /> {t("reject")}
        </Button>
      ) : null}
      {status !== "pending" ? (
        <Button
          type="button"
          size="sm"
          className="h-11 sm:h-9"
          variant="ghost"
          disabled={pending}
          onClick={() => run(reviewVendorDocument, { id, status: "pending", note: "" }, t("reset"))}
        >
          <Undo2 /> {t("markPending")}
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
            run(reviewVendorDocument, values, t("rejected"), () => setOpen(false));
          }}
        >
          <NoteField<{ id: string; status: "rejected"; note: string }> name="note" label={t("note")} />
        </SheetForm>
      </ActionSheet>
    </div>
  );
}
