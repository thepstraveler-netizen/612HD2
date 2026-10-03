"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  FormProvider,
  useForm,
  useFormContext,
  useFormState,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveLeadsSettings, savePackagesSettings, saveTravelSettings } from "@/lib/packages/admin-actions";
import {
  LEAD_AUTO_ASSIGN,
  leadsSettingsFormSchema,
  packagesSettingsFormSchema,
  travelSettingsFormSchema,
  type LeadsSettingsFormInput,
  type PackagesSettingsFormInput,
  type TravelSettingsFormInput,
} from "@/schemas/package-admin";
import { LocalizedField, SelectField, TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { useSave } from "./use-save";

/**
 * Settings → Packages & leads: three forms, one per settings row
 * (`packages.defaults`, `leads.defaults`, `travel.defaults`), each saved
 * on its own with settings.write.
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
    <form
      onSubmit={onSubmit}
      className="grid max-w-3xl gap-4 rounded-2xl border bg-card p-4 sm:p-6"
      noValidate
    >
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

/** One entry per line (lead sources, lost reasons). */
function LinesField<T extends FieldValues>({
  name,
  label,
  help,
}: {
  name: Path<T>;
  label: string;
  help: string;
}) {
  const t = useTranslations("cms.errors");
  const { register } = useFormContext<T>();
  const { errors } = useFormState<T>();
  const message = (errors as Record<string, { message?: string } | undefined>)[name]?.message;
  const id = `f-${name}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={6}
        aria-invalid={!!message}
        aria-describedby={`${id}-help`}
        {...register(name)}
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {help}
      </p>
      {message ? <p className="text-sm text-destructive">{t.has(message) ? t(message) : message}</p> : null}
    </div>
  );
}

function PackagesDefaultsForm({ defaultValues }: { defaultValues: PackagesSettingsFormInput }) {
  const t = useTranslations("packagesAdmin.settings.packages");
  const form = useForm<PackagesSettingsFormInput>({
    resolver: zodResolver(packagesSettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, savePackagesSettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <SettingsCard title={t("title")} lead={t("lead")} pending={pending} onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<PackagesSettingsFormInput>
            name="advance_percent"
            label={t("advance")}
            help={t("advanceHelp")}
            type="number"
          />
          <TextInputField<PackagesSettingsFormInput>
            name="hold_minutes"
            label={t("holdMinutes")}
            help={t("holdHelp")}
            type="number"
          />
          <TextInputField<PackagesSettingsFormInput>
            name="book_until_days"
            label={t("bookUntil")}
            help={t("bookUntilHelp")}
            type="number"
          />
          <TextInputField<PackagesSettingsFormInput>
            name="max_travellers"
            label={t("maxTravellers")}
            help={t("maxTravellersHelp")}
            type="number"
          />
        </div>
        <LocalizedField<PackagesSettingsFormInput>
          name="cancellation_policy"
          label={t("cancellation")}
          multiline
        />
      </SettingsCard>
    </FormProvider>
  );
}

function LeadsDefaultsForm({ defaultValues }: { defaultValues: LeadsSettingsFormInput }) {
  const t = useTranslations("packagesAdmin.settings.leads");
  const form = useForm<LeadsSettingsFormInput>({
    resolver: zodResolver(leadsSettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveLeadsSettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <SettingsCard title={t("title")} lead={t("lead")} pending={pending} onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField<LeadsSettingsFormInput>
            name="auto_assign"
            label={t("autoAssign")}
            options={LEAD_AUTO_ASSIGN.map((a) => ({ value: a, label: t(`assign.${a}`) }))}
          />
          <TextInputField<LeadsSettingsFormInput>
            name="max_per_phone_per_hour"
            label={t("throttle")}
            help={t("throttleHelp")}
            type="number"
          />
          <TextInputField<LeadsSettingsFormInput>
            name="first_follow_up_hours"
            label={t("firstFollowUp")}
            help={t("firstFollowUpHelp")}
            type="number"
          />
          <TextInputField<LeadsSettingsFormInput>
            name="quote_valid_hours"
            label={t("quoteHours")}
            help={t("quoteHoursHelp")}
            type="number"
          />
          <TextInputField<LeadsSettingsFormInput>
            name="quote_gst_percent"
            label={t("quoteGst")}
            help={t("quoteGstHelp")}
          />
          <TextInputField<LeadsSettingsFormInput>
            name="quote_sac"
            label={t("quoteSac")}
            placeholder="998555"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <LinesField<LeadsSettingsFormInput> name="sources" label={t("sources")} help={t("sourcesHelp")} />
          <LinesField<LeadsSettingsFormInput>
            name="lost_reasons"
            label={t("lostReasons")}
            help={t("lostReasonsHelp")}
          />
        </div>
      </SettingsCard>
    </FormProvider>
  );
}

function TravelDefaultsForm({
  defaultValues,
  provider,
}: {
  defaultValues: TravelSettingsFormInput;
  provider: string;
}) {
  const t = useTranslations("packagesAdmin.settings.travel");
  const form = useForm<TravelSettingsFormInput>({
    resolver: zodResolver(travelSettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveTravelSettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <SettingsCard title={t("title")} lead={t("lead")} pending={pending} onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="f-travel-provider">{t("provider")}</Label>
            <Input
              id="f-travel-provider"
              value={provider}
              readOnly
              aria-describedby="f-travel-provider-help"
            />
            <p id="f-travel-provider-help" className="text-xs text-muted-foreground">
              {t("providerHelp")}
            </p>
          </div>
          <TextInputField<TravelSettingsFormInput>
            name="max_travellers"
            label={t("maxTravellers")}
            type="number"
          />
          <TextInputField<TravelSettingsFormInput>
            name="flight_classes"
            label={t("flightClasses")}
            help={t("classesHelp")}
          />
          <TextInputField<TravelSettingsFormInput>
            name="train_classes"
            label={t("trainClasses")}
            help={t("classesHelp")}
          />
          <TextInputField<TravelSettingsFormInput>
            name="bus_classes"
            label={t("busClasses")}
            help={t("classesHelp")}
          />
        </div>
        <LocalizedField<TravelSettingsFormInput> name="notice" label={t("notice")} multiline />
      </SettingsCard>
    </FormProvider>
  );
}

export function PackagesSettingsForms({
  packages,
  leads,
  travel,
  travelProvider,
}: {
  packages: PackagesSettingsFormInput;
  leads: LeadsSettingsFormInput;
  travel: TravelSettingsFormInput;
  travelProvider: string;
}) {
  const t = useTranslations("packagesAdmin.settings");
  return (
    <section className="grid gap-4" aria-labelledby="packages-leads-settings">
      <h2 id="packages-leads-settings" className="text-[length:var(--text-heading,1.25rem)] font-semibold">
        {t("title")}
      </h2>
      <PackagesDefaultsForm defaultValues={packages} />
      <LeadsDefaultsForm defaultValues={leads} />
      <TravelDefaultsForm defaultValues={travel} provider={travelProvider} />
    </section>
  );
}
