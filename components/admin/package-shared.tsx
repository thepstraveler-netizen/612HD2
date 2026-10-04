"use client";

import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition, type ComponentProps } from "react";
import {
  useFieldArray,
  useFormContext,
  useFormState,
  type FieldError,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";
import { cn } from "@/lib/utils";
import type { LocalizedListRowInput } from "@/schemas/package-admin";

/** Message for an error code: packages admin first, then the shared CMS ones. */
export function usePackageErrorText() {
  const t = useTranslations();
  return (code: string) =>
    t.has(`packagesAdmin.errors.${code}`)
      ? t(`packagesAdmin.errors.${code}`)
      : t.has(`cms.errors.${code}`)
        ? t(`cms.errors.${code}`)
        : t("cms.errors.saveFailed");
}

/**
 * Save handler for the package admin forms. After creating it opens
 * `afterCreate(id)`; otherwise it refreshes. Field errors land on their
 * field; `_form` errors (tier overlaps, …) show in {@link PackageFormIssue}.
 */
export function usePackageSave<T extends FieldValues>(
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
  const errorText = usePackageErrorText();
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
      if (result.field) form.setError(result.field as Path<T>, { message: result.error });
      toast.error(errorText(result.error));
    });

  const onInvalid = () => toast.error(t("errors.invalid"));

  return { pending, onSubmit: form.handleSubmit(onValid, onInvalid) };
}

/** Runs a one-off action (archive, restore) with a toast, then navigates or refreshes. */
export function usePackageAction(messages?: Record<string, string>) {
  const baseText = usePackageErrorText();
  const errorText = (code: string) => messages?.[code] ?? baseText(code);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<MutationResult>, success: string, redirectTo?: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        if (redirectTo) {
          router.push(redirectTo);
          return;
        }
      } else {
        toast.error(errorText(result.error));
      }
      router.refresh();
    });
  return { pending, run };
}

export function PackageDeleteButton({
  id,
  action,
  confirmText,
  inUseText,
}: {
  id: string;
  action: (input: unknown) => Promise<MutationResult>;
  confirmText?: string;
  /** What to say when the server refuses because the row is in use. */
  inUseText?: string;
}) {
  const t = useTranslations("cms.actions");
  const { pending, run } = usePackageAction(inUseText ? { inUse: inUseText } : undefined);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-11 text-destructive sm:h-9"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmText ?? t("confirmDelete"))) return;
        run(() => action({ id }), t("deleted"));
      }}
    >
      <Trash2 /> {t("delete")}
    </Button>
  );
}

/** Problems the server reports on the `_form` path (tier overlaps, tiers needed to book). */
export function PackageFormIssue<T extends FieldValues>({ form }: { form?: UseFormReturn<T> }) {
  const errorText = usePackageErrorText();
  const context = useFormState<T>(form ? { control: form.control } : undefined);
  const message = (context.errors as Record<string, { message?: string } | undefined>)._form?.message;
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {errorText(message)}
    </p>
  );
}

// ---------------------------------------------------------------- row editors

/** Field error text (zod messages are keys under cms.errors). */
function useErrorText() {
  const t = useTranslations("cms.errors");
  return (error: FieldError | undefined) => {
    const message = error?.message;
    if (!message) return undefined;
    return t.has(message) ? t(message) : message;
  };
}

function fieldError<T extends FieldValues>(form: UseFormReturn<T>, name: string): FieldError | undefined {
  return name
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc as Record<string, unknown> | undefined)?.[part],
      form.formState.errors,
    ) as FieldError | undefined;
}

/** A compact labelled input for the row editors (ids are unique per row). */
export function MiniField<T extends FieldValues>({
  form,
  name,
  label,
  idPrefix,
  className,
  ...input
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  idPrefix: string;
  className?: string;
} & Omit<ComponentProps<typeof Input>, "form" | "name" | "id">) {
  const errorText = useErrorText();
  const message = errorText(fieldError(form, name));
  const id = `${idPrefix}-${name}`;
  return (
    <div className={cn("grid gap-1", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} aria-invalid={!!message} {...input} {...form.register(name)} />
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}

export function MiniSwitch<T extends FieldValues>({
  form,
  name,
  label,
  idPrefix,
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${name}`;
  const checked = Boolean(form.watch(name));
  return (
    <div className="flex min-h-11 items-center gap-2">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(v) => form.setValue(name, v as T[Path<T>], { shouldDirty: true })}
      />
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
    </div>
  );
}

/**
 * A list of `{ en, hi }` lines (highlights, inclusions, exclusions) bound to
 * one array field of the surrounding form. Empty rows are dropped on save.
 */
export function LocalizedListField<T extends FieldValues>({
  name,
  label,
  placeholder,
  max = 30,
}: {
  name: Path<T>;
  label: string;
  placeholder?: string;
  max?: number;
}) {
  const t = useTranslations("packagesAdmin.lists");
  const tf = useTranslations("cms.fields");
  const te = useTranslations("cms.errors");
  const { control, register } = useFormContext<T>();
  const { errors } = useFormState<T>();
  // useFieldArray's name type only admits array paths; this field is always one.
  const rows = useFieldArray({ control, name: name as never, keyName: "key" });
  const rowErrors = (errors as Record<string, unknown>)[name] as
    ({ en?: { message?: string } } | undefined)[] | undefined;
  return (
    <fieldset className="grid gap-2 rounded-xl border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      {rows.fields.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : null}
      {rows.fields.map((field, index) => {
        const message = rowErrors?.[index]?.en?.message;
        return (
          <div key={field.key} className="grid items-start gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              aria-label={`${label} ${index + 1} · ${tf("english")}`}
              lang="en"
              placeholder={placeholder}
              aria-invalid={!!message}
              {...register(`${name}.${index}.en` as Path<T>)}
            />
            <Input
              aria-label={`${label} ${index + 1} · ${tf("hindi")}`}
              lang="hi"
              {...register(`${name}.${index}.hi` as Path<T>)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("remove")}
              onClick={() => rows.remove(index)}
            >
              <Trash2 />
            </Button>
            {message ? (
              <p className="text-xs text-destructive sm:col-span-3">
                {te.has(message) ? te(message) : message}
              </p>
            ) : null}
          </div>
        );
      })}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 sm:h-9"
          disabled={rows.fields.length >= max}
          onClick={() => rows.append({ en: "", hi: "" } satisfies LocalizedListRowInput as never)}
        >
          <Plus /> {t("add")}
        </Button>
      </div>
    </fieldset>
  );
}

/** Archive (soft delete) a package, or restore an archived one (it comes back hidden). */
export function PackageArchiveButton({
  id,
  archived,
  archive,
  restore,
  listHref,
}: {
  id: string;
  archived: boolean;
  archive: (input: unknown) => Promise<MutationResult>;
  restore: (input: unknown) => Promise<MutationResult>;
  listHref: string;
}) {
  const t = useTranslations("packagesAdmin.actions");
  const { pending, run } = usePackageAction();
  if (archived) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => restore({ id }), t("restored"))}
      >
        <ArchiveRestore /> {t("restore")}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t("confirmArchive"))) return;
        run(() => archive({ id }), t("archived"), listHref);
      }}
    >
      <Archive /> {t("archive")}
    </Button>
  );
}
