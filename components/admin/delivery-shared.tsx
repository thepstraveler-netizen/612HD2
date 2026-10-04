"use client";

import { Pause, Play, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";

/** Message for an error code: delivery admin first, then the shared CMS ones. */
export function useDeliveryErrorText() {
  const t = useTranslations();
  return (code: string) =>
    t.has(`deliveryAdmin.errors.${code}`)
      ? t(`deliveryAdmin.errors.${code}`)
      : t.has(`cms.errors.${code}`)
        ? t(`cms.errors.${code}`)
        : t("cms.errors.saveFailed");
}

/**
 * Save handler for the delivery admin forms. After creating it opens
 * `afterCreate(id)`; otherwise it refreshes. A server field error is shown
 * translated on that field.
 */
export function useDeliverySave<T extends FieldValues>(
  form: UseFormReturn<T>,
  action: (input: unknown) => Promise<MutationResult>,
  {
    isNew,
    afterCreate,
    onSaved,
  }: {
    isNew: boolean;
    afterCreate?: (id: string | undefined) => string;
    onSaved?: (id: string | undefined) => void;
  },
) {
  const t = useTranslations("cms");
  const errorText = useDeliveryErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onValid = () =>
    startTransition(async () => {
      const values = form.getValues();
      const result = await action(values);
      if (result.ok) {
        toast.success(t("actions.saved"));
        form.reset(values);
        onSaved?.(result.id);
        if (isNew && afterCreate) router.push(afterCreate(result.id));
        else router.refresh();
        return;
      }
      if (result.field && !result.field.startsWith("_")) {
        form.setError(result.field as Path<T>, { message: result.error });
      }
      toast.error(errorText(result.error));
    });

  const onInvalid = () => toast.error(t("errors.invalid"));

  return { pending, onSubmit: form.handleSubmit(onValid, onInvalid) };
}

/** Runs a one-off action (toggle, delete) with a toast and a refresh. */
export function useDeliveryAction() {
  const t = useTranslations("cms.actions");
  const errorText = useDeliveryErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<MutationResult>, success: string = t("saved"), after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        after?.();
      } else {
        toast.error(errorText(result.error));
      }
      router.refresh();
    });
  return { pending, run };
}

export function DeliveryDeleteButton({
  id,
  action,
  redirectTo,
  confirmText,
  size,
  onDeleted,
}: {
  id: string;
  action: (input: unknown) => Promise<MutationResult>;
  /** Navigate here afterwards; without it the page refreshes. */
  redirectTo?: string;
  confirmText?: string;
  size?: "sm" | "default";
  onDeleted?: () => void;
}) {
  const t = useTranslations("cms.actions");
  const errorText = useDeliveryErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmText ?? t("confirmDelete"))) return;
        startTransition(async () => {
          const result = await action({ id });
          if (result.ok) {
            toast.success(t("deleted"));
            onDeleted?.();
            if (redirectTo) router.push(redirectTo);
            else router.refresh();
          } else {
            toast.error(errorText(result.error));
          }
        });
      }}
    >
      <Trash2 /> {t("delete")}
    </Button>
  );
}

/** Pause / resume orders at once (the store form has the same switch). */
export function StoreAcceptingToggle({
  id,
  accepting,
  action,
}: {
  id: string;
  accepting: boolean;
  action: (input: unknown) => Promise<MutationResult>;
}) {
  const t = useTranslations("deliveryAdmin.stores");
  const { pending, run } = useDeliveryAction();
  return (
    <Button
      type="button"
      size="sm"
      className="h-11 sm:h-9"
      variant={accepting ? "outline" : "default"}
      disabled={pending}
      onClick={() =>
        run(
          () => action({ id, accepting_orders: !accepting }),
          accepting ? t("pausedToast") : t("resumedToast"),
        )
      }
    >
      {accepting ? <Pause /> : <Play />} {accepting ? t("pause") : t("resume")}
    </Button>
  );
}
