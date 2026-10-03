"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, CheckCheck, HandCoins, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormProvider, useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { formatPaise } from "@/lib/money";
import {
  addAdjustment,
  cancelPayout,
  createPayout,
  markPayoutPaid,
  type SettlementActionResult,
} from "@/lib/settlements/admin-actions";
import {
  PAYOUT_METHODS,
  adjustmentSchema,
  createPayoutSchema,
  markPayoutPaidSchema,
  type AdjustmentInput,
  type MarkPayoutPaidInput,
} from "@/schemas/settlements";
import { ActionSheet, SheetForm } from "./action-sheet";
import { SelectField, TextInputField } from "./form-fields";
import { NoteField } from "./vendor-actions";

/** Error keys from the settlement actions → text (settlementsAdmin.errors, then cms.errors). */
function useSettlementErrorText() {
  const t = useTranslations("settlementsAdmin.errors");
  const cms = useTranslations("cms.errors");
  return (key: string) => (t.has(key) ? t(key) : cms.has(key) ? cms(key) : t("actionFailed"));
}

function useRun() {
  const router = useRouter();
  const errorText = useSettlementErrorText();
  const [pending, startTransition] = useTransition();
  const run = (
    action: (input: unknown) => Promise<SettlementActionResult>,
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

type CreateInput = z.input<typeof createPayoutSchema>;

/** Gathers a vendor's unsettled rows up to a date into a pending payout. */
export function CreatePayoutButton({
  vendorId,
  vendorName,
  defaultPeriodEnd,
  size = "default",
}: {
  vendorId: string;
  vendorName: string;
  defaultPeriodEnd: string;
  size?: "default" | "sm";
}) {
  const t = useTranslations("settlementsAdmin.payouts");
  const router = useRouter();
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const form = useForm<CreateInput>({
    resolver: zodResolver(createPayoutSchema, undefined, { raw: true }),
    defaultValues: { vendorId, periodEnd: defaultPeriodEnd },
  });
  return (
    <>
      <Button type="button" size={size} disabled={pending} onClick={() => setOpen(true)}>
        <Plus /> {t("create")}
      </Button>
      <ActionSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("createTitle", { vendor: vendorName })}
        lead={t("createLead")}
      >
        <SheetForm
          form={form}
          pending={pending}
          submitLabel={t("confirmCreate")}
          onSubmit={(values) =>
            run(createPayout, values, t("created"), (result) => {
              setOpen(false);
              if (result.id) router.push(`/admin/payments/settlements/payouts/${result.id}`);
            })
          }
        >
          <TextInputField<CreateInput>
            name="periodEnd"
            type="date"
            label={t("periodEnd")}
            help={t("periodEndHelp")}
          />
        </SheetForm>
      </ActionSheet>
    </>
  );
}

/** Mark paid (method, UTR / reference, notes) and cancel, for a pending payout. */
export function PayoutActions({ payoutId, amountPaise }: { payoutId: string; amountPaise: number }) {
  const t = useTranslations("settlementsAdmin.payouts");
  const tm = useTranslations("settlementsAdmin.methods");
  const locale = useLocale();
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const form = useForm<MarkPayoutPaidInput>({
    resolver: zodResolver(markPayoutPaidSchema, undefined, { raw: true }),
    defaultValues: {
      id: payoutId,
      method: amountPaise >= 0 ? "bank_transfer" : "upi",
      reference: "",
      notes: "",
    },
  });
  const amount = formatPaise(Math.abs(amountPaise), locale);
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={pending} onClick={() => setOpen(true)}>
        <CheckCheck /> {amountPaise >= 0 ? t("markPaid") : t("markCollected")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="text-destructive"
        disabled={pending}
        onClick={() => {
          if (window.confirm(t("confirmCancel"))) run(cancelPayout, { id: payoutId }, t("cancelled"));
        }}
      >
        <Ban /> {t("cancel")}
      </Button>
      <ActionSheet
        open={open}
        onClose={() => setOpen(false)}
        title={amountPaise >= 0 ? t("markPaidTitle", { amount }) : t("markCollectedTitle", { amount })}
        lead={t("markPaidLead")}
      >
        <SheetForm
          form={form}
          pending={pending}
          submitLabel={t("confirmPaid")}
          onSubmit={(values) =>
            run(
              markPayoutPaid,
              values,
              t("paid"),
              () => setOpen(false),
              (r) => r.field && form.setError(r.field as Path<MarkPayoutPaidInput>, { message: r.error }),
            )
          }
        >
          <SelectField<MarkPayoutPaidInput>
            name="method"
            label={t("method")}
            options={PAYOUT_METHODS.map((m) => ({ value: m, label: tm(m) }))}
          />
          <TextInputField<MarkPayoutPaidInput>
            name="reference"
            label={t("reference")}
            help={t("referenceHelp")}
          />
          <NoteField<MarkPayoutPaidInput> name="notes" label={t("notes")} />
        </SheetForm>
      </ActionSheet>
    </div>
  );
}

/** A manual credit (platform owes the vendor more) or debit (vendor owes) on the ledger. */
export function AdjustmentForm({ vendorId }: { vendorId: string }) {
  const t = useTranslations("settlementsAdmin.adjustment");
  const { pending, run } = useRun();
  const errorText = useSettlementErrorText();
  const form = useForm<AdjustmentInput>({
    resolver: zodResolver(adjustmentSchema, undefined, { raw: true }),
    defaultValues: { vendorId, direction: "credit", amount: "", note: "" },
  });
  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="grid gap-4"
        onSubmit={form.handleSubmit(
          (values) =>
            run(
              addAdjustment,
              values,
              t("added"),
              () => form.reset({ vendorId, direction: "credit", amount: "", note: "" }),
              (r) => r.field && form.setError(r.field as Path<AdjustmentInput>, { message: r.error }),
            ),
          () => toast.error(errorText("invalid")),
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField<AdjustmentInput>
            name="direction"
            label={t("direction")}
            options={[
              { value: "credit", label: t("credit") },
              { value: "debit", label: t("debit") },
            ]}
          />
          <TextInputField<AdjustmentInput> name="amount" label={t("amount")} help={t("amountHelp")} />
        </div>
        <NoteField<AdjustmentInput> name="note" label={t("reason")} help={t("reasonHelp")} />
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={pending}>
            <HandCoins /> {t("submit")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
