"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { requestPasswordReset } from "@/lib/auth/actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/schemas/auth";
import { TextField } from "./fields";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: ForgotPasswordInput) =>
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (result.ok) setSent(true);
      else toast.error(t(`errors.${result.error}`));
    });

  if (sent) {
    return (
      <p role="status" className="rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
        {t("resetSent")}
      </p>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextField control={form.control} name="email" label={t("email")} type="email" autoComplete="email" />
        <Button type="submit" className="w-full" disabled={pending}>
          {t("submitForgot")}
        </Button>
      </form>
    </Form>
  );
}
