"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";

/**
 * Submits the raw form values to a server action (which re-validates them),
 * shows a toast, maps a field error back onto the form, and navigates to
 * `listHref` after creating a new item.
 */
export function useSave<T extends FieldValues>(
  form: UseFormReturn<T>,
  action: (input: unknown) => Promise<MutationResult>,
  { listHref, isNew, transform }: { listHref: string; isNew: boolean; transform?: (values: T) => unknown },
) {
  const t = useTranslations("cms");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onValid = () =>
    startTransition(async () => {
      const values = form.getValues();
      const result = await action(transform ? transform(values) : values);
      if (result.ok) {
        toast.success(t("actions.saved"));
        form.reset(values);
        if (isNew) router.push(listHref);
        else router.refresh();
        return;
      }
      const message = t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.saveFailed");
      if (result.field) form.setError(result.field as Path<T>, { message: result.error });
      toast.error(message);
    });

  const onInvalid = () => toast.error(t("errors.invalid"));

  return { pending, onSubmit: form.handleSubmit(onValid, onInvalid) };
}

/** `2026-10-01T10:00:00Z` → value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value (browser zone) → ISO string, so the server never guesses the zone. */
export function fromLocalInput(value: string | undefined): string {
  return value ? new Date(value).toISOString() : "";
}
