"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FormProvider, type FieldValues, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Side sheet holding one action's form (full width on phones). */
export function ActionSheet({
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

/** A react-hook-form form with one submit button, for use inside {@link ActionSheet}. */
export function SheetForm<T extends FieldValues>({
  form,
  onSubmit,
  pending,
  submitLabel,
  destructive,
  children,
}: {
  form: UseFormReturn<T>;
  onSubmit: (values: T) => void;
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
          (values) => onSubmit(values),
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
