"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { SwitchField, TextInputField, useUnsavedChangesWarning } from "@/components/admin/form-fields";
import { useSave } from "@/components/admin/use-save";
import { Button } from "@/components/ui/button";
import { saveSecuritySettings } from "@/lib/mfa/settings-actions";
import {
  RATE_LIMIT_KEYS,
  securitySettingsFormSchema,
  type SecuritySettingsFormInput,
} from "@/schemas/security";

/**
 * Settings → Security (`security.defaults`): require two-step sign-in for
 * staff, Cloudflare Turnstile on public forms, and requests allowed per
 * visitor in each window. Saves with settings.write.
 */
export function SecuritySettingsForm({ defaultValues }: { defaultValues: SecuritySettingsFormInput }) {
  const t = useTranslations("securitySettings");
  const actions = useTranslations("cms.actions");
  const form = useForm<SecuritySettingsFormInput>({
    resolver: zodResolver(securitySettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveSecuritySettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);

  return (
    <section className="grid gap-4" aria-labelledby="security-settings">
      <h2 id="security-settings" className="text-[length:var(--text-heading,1.25rem)] font-semibold">
        {t("title")}
      </h2>
      <FormProvider {...form}>
        <form
          onSubmit={onSubmit}
          className="grid max-w-3xl gap-4 rounded-2xl border bg-card p-4 sm:p-6"
          noValidate
        >
          <p className="text-sm text-muted-foreground">{t("lead")}</p>
          <div className="grid gap-1">
            <SwitchField<SecuritySettingsFormInput> name="require_admin_mfa" label={t("requireAdminMfa")} />
            <p className="text-xs text-muted-foreground">{t("requireAdminMfaHelp")}</p>
          </div>
          <div className="grid gap-1">
            <SwitchField<SecuritySettingsFormInput> name="turnstile_enabled" label={t("turnstile")} />
            <p className="text-xs text-muted-foreground">{t("turnstileHelp")}</p>
          </div>
          <fieldset className="grid gap-3 rounded-xl border p-3">
            <legend className="px-1 text-sm font-medium">{t("rateLimits")}</legend>
            <p className="text-xs text-muted-foreground">{t("rateLimitsHelp")}</p>
            {RATE_LIMIT_KEYS.map((key) => (
              <div key={key} className="grid gap-2 border-t pt-3 sm:grid-cols-[10rem_1fr_1fr] sm:items-start">
                <p className="text-sm font-medium sm:pt-8">{t(`limits.${key}`)}</p>
                <TextInputField<SecuritySettingsFormInput>
                  name={`rate_limits.${key}.limit`}
                  type="number"
                  label={t("limit")}
                />
                <TextInputField<SecuritySettingsFormInput>
                  name={`rate_limits.${key}.window_minutes`}
                  type="number"
                  label={t("windowMinutes")}
                />
              </div>
            ))}
          </fieldset>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {actions("save")}
            </Button>
          </div>
        </form>
      </FormProvider>
    </section>
  );
}
