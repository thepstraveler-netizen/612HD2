"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { requestPasswordReset } from "@/lib/auth/actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/schemas/auth";
import { TextField } from "./fields";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: ForgotPasswordInput) =>
    startTransition(async () => {
      const result = await requestPasswordReset({ ...values, turnstileToken: captcha ?? undefined });
      if (result.ok) setSent(true);
      else {
        toast.error(t(`errors.${result.error}`));
        setCaptchaKey((k) => k + 1);
      }
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
        <TurnstileWidget action="password-reset" onToken={setCaptcha} resetKey={captchaKey} />
        <Button type="submit" className="w-full" disabled={pending}>
          {t("submitForgot")}
        </Button>
      </form>
    </Form>
  );
}
