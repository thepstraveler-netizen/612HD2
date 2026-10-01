"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { saveAddon, savePackage, savePlace, saveSurcharge } from "@/lib/cabs/admin-actions";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { CAB_TRIP_TYPES } from "@/schemas/cabs";
import {
  CAB_PLACE_KINDS,
  addonFormSchema,
  packageFormSchema,
  placeFormSchema,
  surchargeFormSchema,
  type AddonFormInput,
  type PackageFormInput,
  type PlaceFormInput,
  type SurchargeFormInput,
} from "@/schemas/cab-admin";
import { FormIssue, useCabSave } from "./cab-shared";
import {
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import {
  CheckboxGroupField,
  FormSection,
  SubmitBar,
  WeekdayToggles,
  useLocalizedOptions,
} from "./hotel-shared";

/** Places, local packages, add-ons and peak pricing: the smaller cab catalog forms. */

type CategoryOption = { value: string; label: LocalizedJson };

function useTripTypeOptions() {
  const t = useTranslations("cabsAdmin.tripTypes");
  return CAB_TRIP_TYPES.map((v) => ({ value: v, label: t(v) }));
}

// ---------------------------------------------------------------- places

export function PlaceForm({
  defaultValues,
  listHref,
  deleteButton,
}: {
  defaultValues: PlaceFormInput;
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("cabsAdmin");
  const form = useForm<PlaceFormInput>({
    resolver: zodResolver(placeFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useCabSave(form, savePlace, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("places.sections.place")}>
          <LocalizedField<PlaceFormInput> name="name" label={t("fields.name")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<PlaceFormInput>
              name="slug"
              label={t("fields.slug")}
              placeholder="mathura-junction"
              help={t("fields.slugHelp")}
            />
            <SelectField<PlaceFormInput>
              name="kind"
              label={t("places.kind")}
              options={CAB_PLACE_KINDS.map((k) => ({ value: k, label: t(`places.kinds.${k}`) }))}
            />
            <TextInputField<PlaceFormInput> name="lat" label={t("places.lat")} placeholder="27.5650" />
            <TextInputField<PlaceFormInput> name="lng" label={t("places.lng")} placeholder="77.6593" />
          </div>
          <p className="text-xs text-muted-foreground">{t("places.coordsHelp")}</p>
          <div className="flex flex-wrap items-end gap-6">
            <TextInputField<PlaceFormInput>
              name="sort_order"
              label={t("fields.sortOrder")}
              type="number"
              className="w-28"
            />
            <SwitchField<PlaceFormInput> name="is_popular" label={t("fields.popular")} />
            <SwitchField<PlaceFormInput> name="is_active" label={t("fields.active")} />
          </div>
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

// ---------------------------------------------------------------- local packages

export function PackageForm({
  defaultValues,
  categories,
  listHref,
  deleteButton,
}: {
  defaultValues: PackageFormInput;
  categories: CategoryOption[];
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("cabsAdmin");
  const locale = useLocale();
  const form = useForm<PackageFormInput>({
    resolver: zodResolver(packageFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useCabSave(form, savePackage, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);
  const categoryName = new Map(categories.map((c) => [c.value, pickLocalized(c.label, locale)]));

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <FormSection title={t("packages.sections.package")}>
          <LocalizedField<PackageFormInput> name="name" label={t("fields.name")} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInputField<PackageFormInput>
              name="key"
              label={t("fields.key")}
              placeholder="8hr-80km"
              help={t("fields.slugHelp")}
            />
            <TextInputField<PackageFormInput> name="hours" label={t("packages.hours")} type="number" />
            <TextInputField<PackageFormInput> name="km" label={t("packages.km")} type="number" />
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <TextInputField<PackageFormInput>
              name="sort_order"
              label={t("fields.sortOrder")}
              type="number"
              className="w-28"
            />
            <SwitchField<PackageFormInput> name="is_active" label={t("fields.active")} />
          </div>
        </FormSection>

        <FormSection title={t("packages.sections.fares")}>
          <p className="text-sm text-muted-foreground">{t("packages.faresLead")}</p>
          <FareTable
            headers={[
              t("fares.category"),
              t("packages.fare"),
              t("packages.extraKm"),
              t("packages.extraHour"),
            ]}
            rows={(defaultValues.fares ?? []).map((f, index) => ({
              key: f.category_id,
              label: categoryName.get(f.category_id) ?? "",
              cells: [
                <MoneyCell key="f" name={`fares.${index}.fare`} label={t("packages.fare")} />,
                <MoneyCell key="k" name={`fares.${index}.extra_km`} label={t("packages.extraKm")} />,
                <MoneyCell key="h" name={`fares.${index}.extra_hour`} label={t("packages.extraHour")} />,
              ],
            }))}
          />
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

/** A compact table of inputs: one row per category. Horizontal scroll on phones. */
export function FareTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: { key: string; label: string; cells: ReactNode[] }[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b last:border-0">
              <th scope="row" className="px-3 py-2 font-medium whitespace-nowrap">
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td key={i} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A rupee input inside a fare table; the column header is its visible label. */
export function MoneyCell({
  name,
  label,
  placeholder,
}: {
  name: string;
  label: string;
  placeholder?: string;
}) {
  return <GridInput name={name} label={label} placeholder={placeholder ?? "₹"} inputMode="decimal" />;
}

export function GridInput({
  name,
  label,
  placeholder,
  inputMode = "numeric",
}: {
  name: string;
  label: string;
  placeholder?: string;
  inputMode?: "numeric" | "decimal";
}) {
  const t = useTranslations("cms.errors");
  const { register, getFieldState, formState } = useFormContextLoose();
  const error = getFieldState(name, formState).error?.message;
  return (
    <div className="grid gap-1">
      <Input
        aria-label={label}
        aria-invalid={!!error}
        inputMode={inputMode}
        placeholder={placeholder}
        className="h-10 min-w-24"
        {...register(name)}
      />
      {error ? <span className="text-xs text-destructive">{t.has(error) ? t(error) : error}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------- add-ons

export function AddonForm({
  defaultValues,
  categories,
  listHref,
  deleteButton,
}: {
  defaultValues: AddonFormInput;
  categories: CategoryOption[];
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("cabsAdmin");
  const form = useForm<AddonFormInput>({
    resolver: zodResolver(addonFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useCabSave(form, saveAddon, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);
  const tripTypes = useTripTypeOptions();
  const categoryOptions = useLocalizedOptions(categories);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("addons.sections.addon")}>
          <LocalizedField<AddonFormInput> name="name" label={t("fields.name")} />
          <LocalizedField<AddonFormInput> name="description" label={t("fields.description")} multiline />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<AddonFormInput>
              name="key"
              label={t("fields.key")}
              placeholder="extra-luggage"
              help={t("fields.slugHelp")}
            />
            <TextInputField<AddonFormInput>
              name="price"
              label={t("addons.price")}
              help={t("fields.rupeesHelp")}
            />
          </div>
        </FormSection>
        <FormSection title={t("fields.appliesTo")}>
          <CheckboxGroupField<AddonFormInput, string>
            name="trip_types"
            label={t("fields.tripTypes")}
            options={tripTypes}
          />
          <CheckboxGroupField<AddonFormInput, string>
            name="category_ids"
            label={t("fields.categories")}
            options={categoryOptions}
          />
          <p className="text-xs text-muted-foreground">{t("fields.noneMeansAll")}</p>
          <div className="flex flex-wrap items-end gap-6">
            <TextInputField<AddonFormInput>
              name="sort_order"
              label={t("fields.sortOrder")}
              type="number"
              className="w-28"
            />
            <SwitchField<AddonFormInput> name="is_active" label={t("fields.active")} />
          </div>
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

// ---------------------------------------------------------------- peak pricing

export function SurchargeForm({
  defaultValues,
  categories,
  listHref,
  deleteButton,
}: {
  defaultValues: SurchargeFormInput;
  categories: CategoryOption[];
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("cabsAdmin");
  const form = useForm<SurchargeFormInput>({
    resolver: zodResolver(surchargeFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useCabSave(form, saveSurcharge, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);
  const tripTypes = useTripTypeOptions();
  const categoryOptions = useLocalizedOptions(categories);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("surcharges.sections.rule")}>
          <LocalizedField<SurchargeFormInput> name="name" label={t("fields.name")} />
          <TextInputField<SurchargeFormInput>
            name="multiplier_percent"
            label={t("surcharges.multiplier")}
            help={t("surcharges.multiplierHelp")}
            className="max-w-60"
          />
        </FormSection>
        <FormSection title={t("surcharges.sections.when")}>
          <div className="grid grid-cols-2 gap-4">
            <TextInputField<SurchargeFormInput>
              name="starts_on"
              label={t("surcharges.startsOn")}
              type="date"
            />
            <TextInputField<SurchargeFormInput> name="ends_on" label={t("surcharges.endsOn")} type="date" />
          </div>
          <p className="text-xs text-muted-foreground">{t("surcharges.datesHelp")}</p>
          <WeekdayToggles<SurchargeFormInput> name="weekdays" label={t("surcharges.weekdays")} />
        </FormSection>
        <FormSection title={t("fields.appliesTo")}>
          <CheckboxGroupField<SurchargeFormInput, string>
            name="trip_types"
            label={t("fields.tripTypes")}
            options={tripTypes}
          />
          <CheckboxGroupField<SurchargeFormInput, string>
            name="category_ids"
            label={t("fields.categories")}
            options={categoryOptions}
          />
          <p className="text-xs text-muted-foreground">{t("fields.noneMeansAll")}</p>
          <SwitchField<SurchargeFormInput> name="is_active" label={t("fields.active")} />
        </FormSection>
        <FormIssue />
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

// ---------------------------------------------------------------- helpers

/** Form context for inputs addressed by a runtime path (grid cells). */
function useFormContextLoose() {
  return useFormContext<Record<string, unknown>>();
}
