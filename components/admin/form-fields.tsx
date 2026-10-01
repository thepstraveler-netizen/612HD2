"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useController, useFormContext, useFormState, type FieldValues, type Path } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Reads a nested error message (`a.b.c`) and translates zod's i18n key. */
function useFieldError(name: string): string | undefined {
  const t = useTranslations("cms.errors");
  const { errors } = useFormState();
  const error = name
    .split(".")
    .reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], errors) as
    { message?: string; en?: { message?: string } } | undefined;
  const message = error?.message ?? error?.en?.message;
  if (!message) return undefined;
  return t.has(message) ? t(message) : message;
}

function ErrorText({ message, id }: { message?: string; id: string }) {
  return message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export function TextInputField<T extends FieldValues>({
  name,
  label,
  type = "text",
  placeholder,
  className,
  help,
}: {
  name: Path<T>;
  label: string;
  type?: string;
  placeholder?: string;
  className?: string;
  help?: string;
}) {
  const { register } = useFormContext<T>();
  const error = useFieldError(name);
  const id = `f-${name}`;
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...register(name, type === "number" ? { valueAsNumber: true } : undefined)}
      />
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      <ErrorText message={error} id={`${id}-error`} />
    </div>
  );
}

/** English + Hindi inputs for one `{ en, hi }` value. English is required. */
export function LocalizedField<T extends FieldValues>({
  name,
  label,
  multiline = false,
  className,
}: {
  name: Path<T>;
  label: string;
  multiline?: boolean;
  className?: string;
}) {
  const t = useTranslations("cms.fields");
  const { register, watch } = useFormContext<T>();
  const error = useFieldError(name);
  const en = watch(`${name}.en` as Path<T>) as string | undefined;
  const hi = watch(`${name}.hi` as Path<T>) as string | undefined;
  const Control = multiline ? Textarea : Input;
  const id = `f-${name}`;
  return (
    <fieldset className={cn("grid gap-2 rounded-xl border p-3", className)}>
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-en`} className="text-xs text-muted-foreground">
            {t("english")}
          </Label>
          <Control id={`${id}-en`} lang="en" aria-invalid={!!error} {...register(`${name}.en` as Path<T>)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-hi`} className="text-xs text-muted-foreground">
            {t("hindi")}
          </Label>
          <Control id={`${id}-hi`} lang="hi" {...register(`${name}.hi` as Path<T>)} />
        </div>
      </div>
      {en && !hi ? <p className="text-xs text-accent-amber">{t("missingHindi")}</p> : null}
      <ErrorText message={error} id={`${id}-error`} />
    </fieldset>
  );
}

export function SwitchField<T extends FieldValues>({ name, label }: { name: Path<T>; label: string }) {
  const { field } = useController<T>({ name });
  const id = `f-${name}`;
  return (
    <div className="flex min-h-11 items-center gap-3">
      <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

export function SelectField<T extends FieldValues>({
  name,
  label,
  options,
  className,
}: {
  name: Path<T>;
  label: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const { register } = useFormContext<T>();
  const error = useFieldError(name);
  const id = `f-${name}`;
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} aria-invalid={!!error} {...register(name)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      <ErrorText message={error} id={`${id}-error`} />
    </div>
  );
}

/** Warns before leaving the page with unsaved edits. */
export function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
