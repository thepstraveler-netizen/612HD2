"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useFormState, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";

/** Message for an error code: cabs admin first, then the shared CMS ones. */
export function useCabErrorText() {
  const t = useTranslations();
  return (code: string) =>
    t.has(`cabsAdmin.errors.${code}`)
      ? t(`cabsAdmin.errors.${code}`)
      : t.has(`cms.errors.${code}`)
        ? t(`cms.errors.${code}`)
        : t("cms.errors.saveFailed");
}

/**
 * Like useSave (components/admin/use-save.ts) with the cab error codes.
 * After creating it opens `afterCreate(id)`; otherwise it refreshes. A
 * server field error is shown translated on that field.
 */
export function useCabSave<T extends FieldValues>(
  form: UseFormReturn<T>,
  action: (input: unknown) => Promise<MutationResult>,
  { isNew, afterCreate }: { isNew: boolean; afterCreate?: (id: string | undefined) => string },
) {
  const t = useTranslations("cms");
  const errorText = useCabErrorText();
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

/** Cross-field problems the schemas report on the `_form` path (e.g. "from and to are the same"). */
export function FormIssue() {
  const t = useTranslations("cabsAdmin.errors");
  const { errors } = useFormState();
  const message = (errors as Record<string, { message?: string } | undefined>)._form?.message;
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {t.has(message) ? t(message) : message}
    </p>
  );
}

export function CabDeleteButton({
  id,
  action,
  redirectTo,
  confirmText,
}: {
  id: string;
  action: (input: unknown) => Promise<MutationResult>;
  redirectTo?: string;
  confirmText?: string;
}) {
  const t = useTranslations("cms.actions");
  const errorText = useCabErrorText();
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
