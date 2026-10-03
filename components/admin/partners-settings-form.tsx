"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { FormProvider, useForm, useFormContext, useFormState, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePartnersSettings, saveSettlementsSettings } from "@/lib/partners/settings-actions";
import { PARTNER_BUSINESS_TYPES, PARTNER_DOCUMENT_KINDS } from "@/schemas/partners";
import {
  partnersSettingsFormSchema,
  settlementsSettingsFormSchema,
  type PartnersSettingsFormInput,
  type SettlementsSettingsFormInput,
} from "@/schemas/vendor-admin";
import { LocalizedField, TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { useSave } from "./use-save";

/**
 * Settings → Partners & settlements: `partners.defaults` (business types,
 * documents and default commission per type, upload limit, agreement) and
 * `settlements.defaults` (GST on commission, TCS / TDS, cycle). Each form
 * saves on its own with settings.write.
 */

function SettingsCard({
  title,
  lead,
  pending,
  onSubmit,
  children,
}: {
  title: string;
  lead: string;
  pending: boolean;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("cms.actions");
  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-4 rounded-2xl border bg-card p-4 sm:p-6" noValidate>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </div>
      {children}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

function useErrorAt(path: string): string | undefined {
  const t = useTranslations("vendorsAdmin.settings.errors");
  const cms = useTranslations("cms.errors");
  const { errors } = useFormState();
  const error = path
    .split(".")
    .reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], errors) as
    { message?: string; root?: { message?: string } } | undefined;
  const message = error?.message ?? error?.root?.message;
  if (!message) return undefined;
  return t.has(message) ? t(message) : cms.has(message) ? cms(message) : message;
}

function Checkbox({ id, label, ...props }: { id: string; label: string } & ComponentProps<"input">) {
  return (
    <label htmlFor={id} className="flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm">
      <input id={id} type="checkbox" className="size-4 accent-primary" {...props} />
      {label}
    </label>
  );
}

function BusinessTypesField() {
  const t = useTranslations("vendorsAdmin");
  const { register } = useFormContext<PartnersSettingsFormInput>();
  const error = useErrorAt("business_types");
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{t("settings.partners.businessTypes")}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {PARTNER_BUSINESS_TYPES.map((type) => (
          <Checkbox
            key={type}
            id={`ps-type-${type}`}
            value={type}
            label={t(`businessTypes.${type}`)}
            {...register("business_types")}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("settings.partners.businessTypesHelp")}</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  );
}

function TypeBlock({ type }: { type: (typeof PARTNER_BUSINESS_TYPES)[number] }) {
  const t = useTranslations("vendorsAdmin");
  const { register } = useFormContext<PartnersSettingsFormInput>();
  const offered = useWatch<PartnersSettingsFormInput, "business_types">({ name: "business_types" });
  const commissionError = useErrorAt(`types.${type}.commission_percent`);
  const docsError = useErrorAt(`types.${type}.documents`);
  const id = `ps-${type}-commission`;
  return (
    <details className="group rounded-xl border p-3" open={commissionError || docsError ? true : undefined}>
      <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 text-sm font-medium">
        <span>{t(`businessTypes.${type}`)}</span>
        {Array.isArray(offered) && !offered.includes(type) ? (
          <span className="text-xs text-muted-foreground">{t("settings.partners.notOffered")}</span>
        ) : null}
      </summary>
      <div className="mt-3 grid gap-3">
        <div className="grid max-w-xs gap-2">
          <Label htmlFor={id}>{t("settings.partners.commission")}</Label>
          <Input id={id} inputMode="decimal" aria-invalid={!!commissionError} {...register(`types.${type}.commission_percent`)} />
          {commissionError ? <p className="text-sm text-destructive">{commissionError}</p> : null}
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs text-muted-foreground">{t("settings.partners.requiredDocs")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PARTNER_DOCUMENT_KINDS.map((kind) => (
              <Checkbox
                key={kind}
                id={`ps-${type}-doc-${kind}`}
                value={kind}
                label={t(`documentKinds.${kind}`)}
                {...register(`types.${type}.documents`)}
              />
            ))}
          </div>
          {docsError ? <p className="text-sm text-destructive">{docsError}</p> : null}
        </fieldset>
      </div>
    </details>
  );
}

function AgreementVersionField() {
  const t = useTranslations("vendorsAdmin.settings.partners");
  const { register } = useFormContext<PartnersSettingsFormInput>();
  const error = useErrorAt("agreement_version");
  return (
    <div className="grid max-w-xs gap-2">
      <Label htmlFor="ps-agreement-version">{t("agreementVersion")}</Label>
      <Input id="ps-agreement-version" aria-invalid={!!error} {...register("agreement_version")} />
      <p className="text-xs text-muted-foreground">{t("agreementVersionHelp")}</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function PartnersDefaultsForm({ defaultValues }: { defaultValues: PartnersSettingsFormInput }) {
  const t = useTranslations("vendorsAdmin.settings.partners");
  const form = useForm<PartnersSettingsFormInput>({
    resolver: zodResolver(partnersSettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, savePartnersSettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <SettingsCard title={t("title")} lead={t("lead")} pending={pending} onSubmit={onSubmit}>
        <BusinessTypesField />
        <div className="grid gap-2">
          <p className="text-sm font-medium">{t("perType")}</p>
          <p className="text-xs text-muted-foreground">{t("perTypeHelp")}</p>
          {PARTNER_BUSINESS_TYPES.map((type) => (
            <TypeBlock key={type} type={type} />
          ))}
        </div>
        <TextInputField<PartnersSettingsFormInput>
          name="max_file_mb"
          label={t("maxFileMb")}
          help={t("maxFileMbHelp")}
          type="number"
          className="max-w-xs"
        />
        <AgreementVersionField />
        <LocalizedField<PartnersSettingsFormInput> name="agreement_body" label={t("agreementBody")} multiline />
      </SettingsCard>
    </FormProvider>
  );
}

function SettlementsDefaultsForm({
  defaultValues,
  provider,
}: {
  defaultValues: SettlementsSettingsFormInput;
  provider: string;
}) {
  const t = useTranslations("vendorsAdmin.settings.settlements");
  const form = useForm<SettlementsSettingsFormInput>({
    resolver: zodResolver(settlementsSettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveSettlementsSettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <SettingsCard title={t("title")} lead={t("lead")} pending={pending} onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<SettlementsSettingsFormInput>
            name="commission_tax_percent"
            label={t("commissionTax")}
            help={t("commissionTaxHelp")}
          />
          <TextInputField<SettlementsSettingsFormInput>
            name="cycle_days"
            label={t("cycleDays")}
            help={t("cycleDaysHelp")}
            type="number"
          />
          <TextInputField<SettlementsSettingsFormInput> name="tcs_percent" label={t("tcs")} help={t("taxHelp")} />
          <TextInputField<SettlementsSettingsFormInput> name="tds_percent" label={t("tds")} help={t("taxHelp")} />
          <div className="grid gap-2">
            <Label htmlFor="ss-provider">{t("provider")}</Label>
            <Input id="ss-provider" value={provider} readOnly aria-describedby="ss-provider-help" />
            <p id="ss-provider-help" className="text-xs text-muted-foreground">
              {t("providerHelp")}
            </p>
          </div>
        </div>
        <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">{t("frozenNote")}</p>
      </SettingsCard>
    </FormProvider>
  );
}

export function PartnersSettingsForms({
  partners,
  settlements,
  provider,
}: {
  partners: PartnersSettingsFormInput;
  settlements: SettlementsSettingsFormInput;
  provider: string;
}) {
  const t = useTranslations("vendorsAdmin.settings");
  return (
    <section className="grid gap-4" aria-labelledby="partners-settlements-settings">
      <h2 id="partners-settlements-settings" className="text-[length:var(--text-heading,1.25rem)] font-semibold">
        {t("title")}
      </h2>
      <PartnersDefaultsForm defaultValues={partners} />
      <SettlementsDefaultsForm defaultValues={settlements} provider={provider} />
    </section>
  );
}
