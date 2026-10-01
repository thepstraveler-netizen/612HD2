"use client";

import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { useController, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { cn } from "@/lib/utils";

/** Message for a mutation error code: hotel-specific first, then the shared CMS ones. */
export function useMutationErrorText() {
  const t = useTranslations();
  return (code: string) =>
    t.has(`hotelsAdmin.errors.${code}`)
      ? t(`hotelsAdmin.errors.${code}`)
      : t.has(`cms.errors.${code}`)
        ? t(`cms.errors.${code}`)
        : t("cms.errors.saveFailed");
}

/**
 * Like useSave (components/admin/use-save.ts) but knows the hotel error
 * codes, and after creating can open the new item (`afterCreate(id)`).
 */
export function useHotelSave<T extends FieldValues>(
  form: UseFormReturn<T>,
  action: (input: unknown) => Promise<MutationResult>,
  {
    isNew,
    afterCreate,
    transform,
    keepValues = false,
  }: {
    isNew: boolean;
    afterCreate?: (id: string | undefined) => string;
    transform?: (values: T) => unknown;
    /** Keep the typed values after saving (bulk edits); otherwise they become the new baseline. */
    keepValues?: boolean;
  },
) {
  const t = useTranslations("cms");
  const errorText = useMutationErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onValid = () =>
    startTransition(async () => {
      const values = form.getValues();
      const result = await action(transform ? transform(values) : values);
      if (result.ok) {
        toast.success(t("actions.saved"));
        if (!keepValues) form.reset(values);
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

export function HotelDeleteButton({
  id,
  action,
  redirectTo,
}: {
  id: string;
  action: (input: unknown) => Promise<MutationResult>;
  redirectTo: string;
}) {
  const t = useTranslations("cms.actions");
  const errorText = useMutationErrorText();
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

export function FormSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-4 rounded-2xl border bg-card p-4", className)}>
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function SubmitBar({
  pending,
  isNew,
  extra,
}: {
  pending: boolean;
  isNew: boolean;
  extra?: ReactNode;
}) {
  const t = useTranslations("cms.actions");
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
      <div>{extra}</div>
      <Button type="submit" disabled={pending}>
        {isNew ? t("create") : t("save")}
      </Button>
    </div>
  );
}

/** A set of checkboxes bound to one array field of the form. */
export function CheckboxGroupField<T extends FieldValues, V extends string | number>({
  name,
  label,
  options,
  columns = "sm:grid-cols-2 lg:grid-cols-3",
}: {
  name: Path<T>;
  label: string;
  options: { value: V; label: string }[];
  columns?: string;
}) {
  const { field } = useController<T>({ name });
  const selected = (field.value ?? []) as V[];
  const toggle = (value: V, on: boolean) =>
    field.onChange(on ? [...selected, value] : selected.filter((v) => v !== value));
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className={cn("grid gap-x-4", columns)}>
        {options.map((o) => {
          const id = `f-${name}-${o.value}`;
          return (
            <label key={String(o.value)} htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                id={id}
                type="checkbox"
                className="size-5 accent-primary"
                checked={selected.includes(o.value)}
                onChange={(e) => toggle(o.value, e.target.checked)}
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Mon..Sun toggle buttons bound to a `number[]` field; none selected = every day. */
export function WeekdayToggles<T extends FieldValues>({ name, label }: { name: Path<T>; label: string }) {
  const t = useTranslations("hotelsAdmin");
  const { field } = useController<T>({ name });
  const selected = ((field.value ?? []) as (number | string)[]).map(Number);
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((day) => {
          const on = selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              onClick={() =>
                field.onChange(
                  on ? selected.filter((d) => d !== day) : [...selected, day].sort((a, b) => a - b),
                )
              }
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-2 text-sm font-medium",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
              )}
            >
              {t(`weekdays.${day}`)}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{selected.length === 0 ? t("allDays") : t("someDays")}</p>
    </fieldset>
  );
}

/** Localized option labels for the current locale. */
export function useLocalizedOptions(options: { value: string; label: LocalizedJson }[]) {
  const locale = useLocale();
  return options.map((o) => ({ value: o.value, label: pickLocalized(o.label, locale) }));
}
