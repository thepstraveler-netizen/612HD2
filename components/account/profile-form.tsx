"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { updateProfile } from "@/lib/account/actions";
import { cn } from "@/lib/utils";
import { LOCALES, profileSchema, type ProfileInput } from "@/schemas/account";

export function ProfileForm({ defaults, email }: { defaults: ProfileInput; email: string }) {
  const t = useTranslations("account");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const errorText = (key: string) => (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.generic"));

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateProfile(values);
      if (result.ok) {
        toast.success(t("profile.saved"));
        form.reset(values);
        router.refresh();
      } else {
        toast.error(t(`errors.${result.error === "unknown" ? "generic" : result.error}`));
      }
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid max-w-xl gap-5" noValidate>
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("profile.fullName")}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage translateKey={errorText} />
            </FormItem>
          )}
        />
        <div className="grid gap-2">
          <label htmlFor="profile-email" className="text-sm font-medium">
            {t("profile.email")}
          </label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            readOnly
            aria-describedby="profile-email-hint"
          />
          <p id="profile-email-hint" className="text-xs text-muted-foreground">
            {t("profile.emailHint")}
          </p>
        </div>
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("profile.phone")}</FormLabel>
              <FormControl>
                <Input type="tel" inputMode="tel" autoComplete="tel" {...field} value={field.value ?? ""} />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t("profile.phoneHint")}</p>
              <FormMessage translateKey={errorText} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="preferredLocale"
          render={({ field }) => (
            <FormItem>
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">{t("profile.language")}</legend>
                <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:max-w-sm">
                  {LOCALES.map((l) => (
                    <label
                      key={l}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium",
                        field.value === l && "border-primary ring-1 ring-primary",
                      )}
                    >
                      <input
                        type="radio"
                        name={field.name}
                        value={l}
                        checked={field.value === l}
                        onChange={() => field.onChange(l)}
                        className="size-4 accent-[var(--primary)]"
                      />
                      <span lang={l}>{t(`profile.languages.${l}`)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-xs text-muted-foreground">{t("profile.languageHint")}</p>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending} className="sm:justify-self-start">
          {t("profile.save")}
        </Button>
      </form>
    </Form>
  );
}
