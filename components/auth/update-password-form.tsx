"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import { updatePassword } from "@/lib/auth/actions";
import { safeNextPath } from "@/lib/utils";
import { updatePasswordSchema, type UpdatePasswordInput } from "@/schemas/auth";
import { TextField } from "./fields";

/** `next`: where to go after a successful change (the admin area sends staff here). */
export function UpdatePasswordForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = (values: UpdatePasswordInput) =>
    startTransition(async () => {
      const result = await updatePassword(values);
      if (result.ok) {
        toast.success(t("passwordUpdated"));
        form.reset();
        if (next) router.push(safeNextPath(next, "/admin"));
      } else {
        toast.error(t(`errors.${result.error}`));
      }
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextField
          control={form.control}
          name="password"
          label={t("newPassword")}
          type="password"
          autoComplete="new-password"
        />
        <p className="-mt-2 text-xs text-muted-foreground">{t("passwordHint")}</p>
        <TextField
          control={form.control}
          name="confirm"
          label={t("confirmPassword")}
          type="password"
          autoComplete="new-password"
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {t("submitUpdate")}
        </Button>
      </form>
    </Form>
  );
}
