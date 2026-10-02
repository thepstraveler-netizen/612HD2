"use client";

import { useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { useFormContext, useFormState, type FieldValues, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { LeadActionResult } from "@/lib/leads/crm-actions";
import { cn } from "@/lib/utils";

/** Message for an action error code: leads admin first, then the shared CMS ones. */
export function useLeadsErrorText() {
  const t = useTranslations();
  return (code: string) =>
    t.has(`leadsAdmin.errors.${code}`)
      ? t(`leadsAdmin.errors.${code}`)
      : t.has(`cms.errors.${code}`)
        ? t(`cms.errors.${code}`)
        : t("leadsAdmin.errors.actionFailed");
}

/**
 * Runs a lead server action: toasts the outcome and refreshes the page on
 * success. `onDone` gets the successful result (for links, new ids);
 * `onError` the failed one (to put a field error on a form).
 */
export function useLeadAction() {
  const errorText = useLeadsErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (
    action: (input: unknown) => Promise<LeadActionResult>,
    input: unknown,
    {
      success,
      onDone,
      onError,
    }: {
      success?: string;
      onDone?: (result: Extract<LeadActionResult, { ok: true }>) => void;
      onError?: (result: Extract<LeadActionResult, { ok: false }>) => void;
    } = {},
  ) =>
    startTransition(async () => {
      const result = await action(input);
      if (result.ok) {
        if (success) toast.success(success);
        onDone?.(result);
        router.refresh();
        return;
      }
      onError?.(result);
      toast.error(errorText(result.error));
    });
  return { pending, run, errorText };
}

/** Right-hand sheet used for the lead dialogs (new lead, lost reason, payment). */
export function LeadSheet({
  open,
  onClose,
  title,
  lead,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-4 sm:p-6">
        <SheetHeader className="pr-10">
          <SheetTitle>{title}</SheetTitle>
          {lead ? <SheetDescription>{lead}</SheetDescription> : null}
        </SheetHeader>
        {open ? children : null}
      </SheetContent>
    </Sheet>
  );
}

/** Multi-line twin of TextInputField (components/admin/form-fields.tsx). */
export function TextareaField<T extends FieldValues>({
  name,
  label,
  placeholder,
  rows = 3,
  className,
  help,
}: {
  name: Path<T>;
  label: string;
  placeholder?: string;
  rows?: number;
  className?: string;
  help?: string;
}) {
  const t = useTranslations("cms.errors");
  const { register } = useFormContext<T>();
  const { errors } = useFormState<T>({ name });
  const error = name
    .split(".")
    .reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], errors) as
    { message?: string } | undefined;
  const message = error?.message ? (t.has(error.message) ? t(error.message) : error.message) : undefined;
  const id = `f-${name}`;
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={!!message}
        aria-describedby={message ? `${id}-error` : undefined}
        {...register(name)}
      />
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      {message ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** Copies text and toasts; falls back to a prompt where the clipboard API is blocked. */
export async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    window.prompt("", text);
  }
}
