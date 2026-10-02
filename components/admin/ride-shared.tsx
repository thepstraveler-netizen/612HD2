"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";

/** Message for an error code: rides admin first, then the shared CMS ones. */
export function useRideErrorText() {
  const t = useTranslations();
  return (code: string) =>
    t.has(`admin.rides.errors.${code}`)
      ? t(`admin.rides.errors.${code}`)
      : t.has(`cms.errors.${code}`)
        ? t(`cms.errors.${code}`)
        : t("cms.errors.saveFailed");
}

/**
 * Save handler for the rides admin forms. After creating it opens
 * `afterCreate(id)`; otherwise it refreshes. A server field error is shown
 * translated on that field.
 */
export function useRideSave<T extends FieldValues>(
  form: UseFormReturn<T>,
  action: (input: unknown) => Promise<MutationResult>,
  { isNew, afterCreate }: { isNew: boolean; afterCreate?: (id: string | undefined) => string },
) {
  const t = useTranslations("cms");
  const errorText = useRideErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onValid = () =>
    startTransition(async () => {
      const values = form.getValues();
      const result = await action(values);
      if (result.ok) {
        toast.success(t("actions.saved"));
        form.reset(values);
        if (isNew && afterCreate) router.push(afterCreate(result.id));
        else router.refresh();
        return;
      }
      if (result.field && !result.field.startsWith("_")) {
        form.setError(result.field as Path<T>, { message: errorText(result.error) });
      }
      toast.error(errorText(result.error));
    });

  const onInvalid = () => toast.error(t("errors.invalid"));

  return { pending, onSubmit: form.handleSubmit(onValid, onInvalid) };
}

export function RideDeleteButton({
  id,
  action,
  redirectTo,
  confirmText,
}: {
  id: string;
  action: (input: unknown) => Promise<MutationResult>;
  redirectTo: string;
  confirmText?: string;
}) {
  const t = useTranslations("cms.actions");
  const errorText = useRideErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmText ?? t("confirmDelete"))) return;
        startTransition(async () => {
          const result = await action({ id });
          if (result.ok) {
            toast.success(t("deleted"));
            router.push(redirectTo);
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
