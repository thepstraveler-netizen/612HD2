"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";

/** Message for an action error code: bookings admin first, then the shared CMS ones. */
export function useBookingsErrorText() {
  const t = useTranslations();
  return (code: string) =>
    t.has(`bookingsAdmin.errors.${code}`)
      ? t(`bookingsAdmin.errors.${code}`)
      : t.has(`cms.errors.${code}`)
        ? t(`cms.errors.${code}`)
        : t("bookingsAdmin.errors.actionFailed");
}

/**
 * Like useSave (components/admin/use-save.ts) with the bookings admin error
 * codes; after creating it opens `afterCreate(id)` (or the list).
 */
export function useBookingsSave<T extends FieldValues>(
  form: UseFormReturn<T>,
  action: (input: unknown) => Promise<MutationResult>,
  {
    isNew,
    afterCreate,
    transform,
  }: { isNew: boolean; afterCreate?: (id: string | undefined) => string; transform?: (values: T) => unknown },
) {
  const t = useTranslations("cms");
  const errorText = useBookingsErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onValid = () =>
    startTransition(async () => {
      const values = form.getValues();
      const result = await action(transform ? transform(values) : values);
      if (result.ok) {
        toast.success(t("actions.saved"));
        form.reset(values);
        if (isNew && afterCreate) router.push(afterCreate(result.id));
        else router.refresh();
        return;
      }
      if (result.field) form.setError(result.field as Path<T>, { message: result.error });
      toast.error(errorText(result.error));
    });

  const onInvalid = () => toast.error(t("errors.invalid"));

  return { pending, onSubmit: form.handleSubmit(onValid, onInvalid) };
}

export function BookingsDeleteButton({
  id,
  action,
  redirectTo,
}: {
  id: string;
  action: (input: unknown) => Promise<MutationResult>;
  redirectTo: string;
}) {
  const t = useTranslations("cms.actions");
  const errorText = useBookingsErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t("confirmDelete"))) return;
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
