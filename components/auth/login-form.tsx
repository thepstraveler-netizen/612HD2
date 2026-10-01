"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { sendMagicLink, signInWithPassword } from "@/lib/auth/actions";
import { magicLinkSchema, signInSchema, type MagicLinkInput, type SignInInput } from "@/schemas/auth";
import { TextField } from "./fields";

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  const passwordForm = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const magicForm = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  const onPassword = (values: SignInInput) =>
    startTransition(async () => {
      const result = await signInWithPassword(values, next);
      if (result && !result.ok) toast.error(t(`errors.${result.error}`));
    });

  const onMagic = (values: MagicLinkInput) =>
    startTransition(async () => {
      const result = await sendMagicLink(values, next);
      if (result.ok) setSent(true);
      else toast.error(t(`errors.${result.error}`));
    });

  return (
    <Tabs defaultValue="password">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="password">{t("tabPassword")}</TabsTrigger>
        <TabsTrigger value="magic">{t("tabMagic")}</TabsTrigger>
      </TabsList>

      <TabsContent value="password">
        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(onPassword)} className="space-y-4" noValidate>
            <TextField
              control={passwordForm.control}
              name="email"
              label={t("email")}
              type="email"
              autoComplete="email"
            />
            <TextField
              control={passwordForm.control}
              name="password"
              label={t("password")}
              type="password"
              autoComplete="current-password"
            />
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                {t("forgotLink")}
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {t("submitLogin")}
            </Button>
          </form>
        </Form>
      </TabsContent>

      <TabsContent value="magic">
        {sent ? (
          <p role="status" className="rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
            {t("magicSent")}
          </p>
        ) : (
          <Form {...magicForm}>
            <form onSubmit={magicForm.handleSubmit(onMagic)} className="space-y-4" noValidate>
              <TextField
                control={magicForm.control}
                name="email"
                label={t("email")}
                type="email"
                autoComplete="email"
              />
              <Button type="submit" className="w-full" disabled={pending}>
                {t("submitMagic")}
              </Button>
            </form>
          </Form>
        )}
      </TabsContent>
    </Tabs>
  );
}
