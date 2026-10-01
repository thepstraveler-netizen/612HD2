"use client";

import { useTranslations } from "next-intl";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/** A labelled input whose Zod error keys are translated from `auth.errors`. */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  type = "text",
  autoComplete,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  type?: string;
  autoComplete?: string;
}) {
  const t = useTranslations("auth.errors");
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} autoComplete={autoComplete} {...field} />
          </FormControl>
          <FormMessage translateKey={(key) => (t.has(key) ? t(key) : key)} />
        </FormItem>
      )}
    />
  );
}
