"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { confirmAdminPassword } from "@/lib/auth/actions";
import { confirmPasswordSchema } from "@/schemas/auth";
import { TextField } from "./fields";

type Values = { password: string };

export function AdminPasswordForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(confirmPasswordSchema),
    defaultValues: { password: "" },
  });

  const onSubmit = (values: Values) =>
    startTransition(async () => {
      // Redirects on success.
      const result = await confirmAdminPassword(values, next);
      if (result && !result.ok) toast.error(t(`errors.${result.error}`));
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextField
          control={form.control}
          name="password"
          label={t("password")}
          type="password"
          autoComplete="current-password"
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {t("adminPasswordSubmit")}
        </Button>
      </form>
    </Form>
  );
}
