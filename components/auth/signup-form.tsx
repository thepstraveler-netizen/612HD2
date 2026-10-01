"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { signUpWithPassword } from "@/lib/auth/actions";
import { signUpSchema, type SignUpInput } from "@/schemas/auth";
import { TextField } from "./fields";

export function SignupForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const onSubmit = (values: SignUpInput) =>
    startTransition(async () => {
      const result = await signUpWithPassword(values, next);
      if (!result) return;
      if (result.ok) setSent(true);
      else toast.error(t(`errors.${result.error}`));
    });

  if (sent) {
    return (
      <p role="status" className="rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
        {t("signupSent")}
      </p>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextField control={form.control} name="fullName" label={t("fullName")} autoComplete="name" />
        <TextField control={form.control} name="email" label={t("email")} type="email" autoComplete="email" />
        <TextField
          control={form.control}
          name="password"
          label={t("password")}
          type="password"
          autoComplete="new-password"
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {t("submitSignup")}
        </Button>
      </form>
    </Form>
  );
}
