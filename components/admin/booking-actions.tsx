"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Ban, CheckCheck, HandCoins, Link2, Mail, Undo2, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { FormProvider, useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRouter } from "@/i18n/navigation";
import {
  cancelBookingAction,
  completeBookingAction,
  recordOfflinePaymentAction,
  refundBookingAction,
  resendConfirmationAction,
  sendPaymentLinkAction,
  type BookingActionResult,
} from "@/lib/bookings/admin-actions";
import type { BookingAction } from "@/lib/bookings/admin-forms";
import { formatPaise, paiseToRupeesInput } from "@/lib/money";
import {
  OFFLINE_METHODS,
  cancelBookingSchema,
  offlinePaymentSchema,
  refundBookingSchema,
  type CancelBookingInput,
  type OfflinePaymentInput,
  type RefundBookingInput,
} from "@/schemas/booking-admin";
import { SelectField, TextInputField } from "./form-fields";
import { useBookingsErrorText } from "./booking-shared";

type Dialog = "cancel" | "refund" | "offlinePayment" | null;

const ICONS: Record<BookingAction, LucideIcon> = {
  cancel: Ban,
  refund: Undo2,
  complete: CheckCheck,
  offlinePayment: HandCoins,
  paymentLink: Link2,
  resendConfirmation: Mail,
};

/**
 * Staff actions for one booking. The server decides which actions apply
 * (status + permissions) and re-checks everything when one runs; money is
 * typed in rupees and sent as text, the server action converts it.
 */
export function BookingActions({
  bookingId,
  actions,
  refundablePaise,
  balancePaise,
  suggestion,
  canRefund,
}: {
  bookingId: string;
  actions: BookingAction[];
  refundablePaise: number;
  balancePaise: number;
  /** Policy refund for a cancellation now. */
  suggestion: { refundPaise: number; percent: number; hoursBefore: number };
  /** payments.refund: without it a cancellation refunds nothing. */
  canRefund: boolean;
}) {
  const t = useTranslations("bookingsAdmin.actions");
  const locale = useLocale();
  const errorText = useBookingsErrorText();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, startTransition] = useTransition();
  const money = (paise: number) => formatPaise(paise, locale);

  /** Runs an action, toasts the outcome; returns whether it succeeded. */
  const run = (
    action: (input: unknown) => Promise<BookingActionResult>,
    input: unknown,
    success: (amountPaise: number) => string,
    onError?: (result: { error: string; field?: string }) => void,
  ) =>
    startTransition(async () => {
      const result = await action(input);
      if (result.ok) {
        toast.success(success("amountPaise" in result ? result.amountPaise : 0));
        setDialog(null);
        router.refresh();
        return;
      }
      onError?.(result);
      toast.error(errorText(result.error));
      router.refresh();
    });

  const quick = (action: BookingAction) => {
    if (action === "complete") {
      if (!window.confirm(t("confirmComplete"))) return;
      run(completeBookingAction, { bookingId }, () => t("completed"));
    } else if (action === "paymentLink") {
      if (!window.confirm(t("confirmPaymentLink", { amount: money(balancePaise) }))) return;
      run(sendPaymentLinkAction, { bookingId }, (a) => t("linkSent", { amount: money(a) }));
    } else if (action === "resendConfirmation") {
      run(resendConfirmationAction, { bookingId }, () => t("confirmationSent"));
    } else {
      setDialog(action);
    }
  };

  if (actions.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const Icon = ICONS[action];
          return (
            <Button
              key={action}
              type="button"
              variant={action === "cancel" ? "outline" : "secondary"}
              className={action === "cancel" ? "text-destructive" : undefined}
              disabled={pending}
              onClick={() => quick(action)}
            >
              <Icon /> {t(action)}
            </Button>
          );
        })}
      </div>

      <ActionSheet
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title={t("cancelTitle")}
        lead={t("cancelLead")}
      >
        <CancelForm
          bookingId={bookingId}
          defaultRefund={canRefund ? suggestion.refundPaise : 0}
          hint={
            refundablePaise === 0
              ? null
              : canRefund
                ? t("refundHint", {
                    amount: money(suggestion.refundPaise),
                    percent: suggestion.percent,
                    hours: suggestion.hoursBefore,
                    max: money(refundablePaise),
                  })
                : t("refundNoPermission")
          }
          canRefund={canRefund && refundablePaise > 0}
          pending={pending}
          onSubmit={(values, form) =>
            run(
              cancelBookingAction,
              values,
              (a) => (a > 0 ? t("cancelledWithRefund", { amount: money(a) }) : t("cancelled")),
              (r) =>
                r.field &&
                form.setError(r.field as Path<CancelBookingInput>, { message: errorText(r.error) }),
            )
          }
        />
      </ActionSheet>

      <ActionSheet
        open={dialog === "refund"}
        onClose={() => setDialog(null)}
        title={t("refundTitle")}
        lead={t("refundLead", { max: money(refundablePaise) })}
      >
        <RefundForm
          bookingId={bookingId}
          max={refundablePaise}
          pending={pending}
          onSubmit={(values, form) =>
            run(
              refundBookingAction,
              values,
              (a) => t("refunded", { amount: money(a) }),
              (r) =>
                r.field &&
                form.setError(r.field as Path<RefundBookingInput>, { message: errorText(r.error) }),
            )
          }
        />
      </ActionSheet>

      <ActionSheet
        open={dialog === "offlinePayment"}
        onClose={() => setDialog(null)}
        title={t("offlineTitle")}
        lead={t("offlineLead", { amount: money(balancePaise) })}
      >
        <OfflinePaymentForm
          bookingId={bookingId}
          balance={balancePaise}
          pending={pending}
          onSubmit={(values, form) =>
            run(
              recordOfflinePaymentAction,
              values,
              (a) => t("paymentRecorded", { amount: money(a) }),
              (r) =>
                r.field &&
                form.setError(r.field as Path<OfflinePaymentInput>, { message: errorText(r.error) }),
            )
          }
        />
      </ActionSheet>
    </>
  );
}

function ActionSheet({
  open,
  onClose,
  title,
  lead,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-4 sm:p-6">
        <SheetHeader className="pr-10">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{lead}</SheetDescription>
        </SheetHeader>
        {open ? children : null}
      </SheetContent>
    </Sheet>
  );
}

type SubmitFn<T extends FieldValues> = (values: T, form: UseFormReturn<T>) => void;

function SheetForm<T extends FieldValues>({
  form,
  onSubmit,
  pending,
  submitLabel,
  destructive,
  children,
}: {
  form: UseFormReturn<T>;
  onSubmit: SubmitFn<T>;
  pending: boolean;
  submitLabel: string;
  destructive?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("cms.errors");
  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="grid gap-4"
        onSubmit={form.handleSubmit(
          (values) => onSubmit(values, form),
          () => toast.error(t("invalid")),
        )}
      >
        {children}
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
          {submitLabel}
        </Button>
      </form>
    </FormProvider>
  );
}

function CancelForm({
  bookingId,
  defaultRefund,
  hint,
  canRefund,
  pending,
  onSubmit,
}: {
  bookingId: string;
  defaultRefund: number;
  hint: string | null;
  canRefund: boolean;
  pending: boolean;
  onSubmit: SubmitFn<CancelBookingInput>;
}) {
  const t = useTranslations("bookingsAdmin.actions");
  const form = useForm<CancelBookingInput>({
    resolver: zodResolver(cancelBookingSchema, undefined, { raw: true }),
    defaultValues: { bookingId, reason: "", refund: paiseToRupeesInput(defaultRefund) || "0" },
  });
  return (
    <SheetForm form={form} onSubmit={onSubmit} pending={pending} submitLabel={t("confirmCancel")} destructive>
      <TextInputField<CancelBookingInput>
        name="reason"
        label={t("reason")}
        placeholder={t("reasonPlaceholder")}
      />
      {canRefund ? (
        <TextInputField<CancelBookingInput>
          name="refund"
          label={t("refundAmount")}
          help={hint ?? undefined}
        />
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </SheetForm>
  );
}

function RefundForm({
  bookingId,
  max,
  pending,
  onSubmit,
}: {
  bookingId: string;
  max: number;
  pending: boolean;
  onSubmit: SubmitFn<RefundBookingInput>;
}) {
  const t = useTranslations("bookingsAdmin.actions");
  const locale = useLocale();
  const form = useForm<RefundBookingInput>({
    resolver: zodResolver(refundBookingSchema, undefined, { raw: true }),
    defaultValues: { bookingId, reason: "", amount: "" },
  });
  return (
    <SheetForm form={form} onSubmit={onSubmit} pending={pending} submitLabel={t("confirmRefund")}>
      <TextInputField<RefundBookingInput>
        name="amount"
        label={t("amount")}
        help={t("upTo", { amount: formatPaise(max, locale) })}
      />
      <TextInputField<RefundBookingInput>
        name="reason"
        label={t("reason")}
        placeholder={t("reasonPlaceholder")}
      />
    </SheetForm>
  );
}

function OfflinePaymentForm({
  bookingId,
  balance,
  pending,
  onSubmit,
}: {
  bookingId: string;
  balance: number;
  pending: boolean;
  onSubmit: SubmitFn<OfflinePaymentInput>;
}) {
  const t = useTranslations("bookingsAdmin");
  const form = useForm<OfflinePaymentInput>({
    resolver: zodResolver(offlinePaymentSchema, undefined, { raw: true }),
    defaultValues: { bookingId, amount: paiseToRupeesInput(balance), method: "cash", reference: "" },
  });
  return (
    <SheetForm form={form} onSubmit={onSubmit} pending={pending} submitLabel={t("actions.confirmOffline")}>
      <TextInputField<OfflinePaymentInput> name="amount" label={t("actions.amount")} />
      <SelectField<OfflinePaymentInput>
        name="method"
        label={t("actions.method")}
        options={OFFLINE_METHODS.map((m) => ({ value: m, label: t(`methods.${m}`) }))}
      />
      <TextInputField<OfflinePaymentInput>
        name="reference"
        label={t("actions.reference")}
        help={t("actions.referenceHelp")}
      />
    </SheetForm>
  );
}
