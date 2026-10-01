"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { saveBusinessProfile, setFeatureFlag } from "@/lib/cms/actions";
import { businessProfileSchema, type BusinessProfile } from "@/schemas/cms";
import { TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { useSave } from "./use-save";

export function BusinessProfileForm({ defaultValues }: { defaultValues: BusinessProfile }) {
  const t = useTranslations("cms");
  const form = useForm<BusinessProfile>({
    resolver: zodResolver(businessProfileSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveBusinessProfile, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        className="grid max-w-3xl gap-4 rounded-2xl border bg-card p-4 sm:p-6"
        noValidate
      >
        <h2 className="text-lg font-semibold">{t("nav.business")}</h2>
        <TextInputField<BusinessProfile> name="name" label={t("fields.businessName")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<BusinessProfile>
            name="phone"
            label={t("fields.phone")}
            type="tel"
            placeholder="+91 98765 43210"
          />
          <TextInputField<BusinessProfile>
            name="whatsapp"
            label={t("fields.whatsapp")}
            type="tel"
            placeholder="919876543210"
          />
          <TextInputField<BusinessProfile> name="email" label={t("fields.email")} type="email" />
          <TextInputField<BusinessProfile> name="gstin" label={t("fields.gstin")} />
        </div>
        <TextInputField<BusinessProfile> name="address" label={t("fields.address")} />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

export type FlagRow = { key: string; enabled: boolean; description: string | null };

export function FeatureFlagList({ flags, canWrite }: { flags: FlagRow[]; canWrite: boolean }) {
  const t = useTranslations("cms");
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(flags, (state, next: { key: string; enabled: boolean }) =>
    state.map((f) => (f.key === next.key ? { ...f, enabled: next.enabled } : f)),
  );
  return (
    <section className="grid max-w-3xl gap-3 rounded-2xl border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{t("nav.flags")}</h2>
      <ul className="divide-y">
        {optimistic.map((flag) => (
          <li key={flag.key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-mono text-sm">{flag.key}</p>
              {flag.description ? <p className="text-sm text-muted-foreground">{flag.description}</p> : null}
            </div>
            <Switch
              checked={flag.enabled}
              disabled={!canWrite || pending}
              aria-label={flag.key}
              onCheckedChange={(enabled) =>
                startTransition(async () => {
                  setOptimistic({ key: flag.key, enabled });
                  const result = await setFeatureFlag({ key: flag.key, enabled });
                  if (result.ok) toast.success(t("actions.saved"));
                  else toast.error(t(`errors.${result.error}`));
                })
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
