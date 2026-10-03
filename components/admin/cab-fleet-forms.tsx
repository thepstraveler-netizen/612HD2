"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { saveDriver, saveVehicle } from "@/lib/cabs/admin-actions";
import type { LocalizedJson } from "@/lib/i18n/localized";
import {
  FUEL_TYPES,
  driverFormSchema,
  vehicleFormSchema,
  type DriverFormInput,
  type VehicleFormInput,
} from "@/schemas/cab-admin";
import { useCabSave } from "./cab-shared";
import { SelectField, SwitchField, TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { FormSection, SubmitBar, useLocalizedOptions } from "./hotel-shared";

/** Driver and vehicle forms. Expiry dates feed the alerts on the lists and the dispatch board. */

export function DriverForm({
  defaultValues,
  editHref,
  deleteButton,
}: {
  defaultValues: DriverFormInput;
  /** A new driver opens at `${editHref}/<id>` to add documents. */
  editHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("cabsAdmin");
  const form = useForm<DriverFormInput>({
    resolver: zodResolver(driverFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useCabSave(form, saveDriver, {
    isNew,
    afterCreate: (id) => (id ? `${editHref}/${id}` : editHref),
  });
  useUnsavedChangesWarning(form.formState.isDirty);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("drivers.sections.driver")}>
          <TextInputField<DriverFormInput> name="full_name" label={t("drivers.name")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<DriverFormInput>
              name="phone"
              label={t("drivers.phone")}
              type="tel"
              placeholder="+919876543210"
            />
            <TextInputField<DriverFormInput> name="alt_phone" label={t("drivers.altPhone")} type="tel" />
            <TextInputField<DriverFormInput>
              name="languages"
              label={t("drivers.languages")}
              help={t("drivers.languagesHelp")}
            />
            <TextInputField<DriverFormInput>
              name="rating"
              label={t("drivers.rating")}
              help={t("drivers.ratingHelp")}
            />
          </div>
        </FormSection>
        <FormSection title={t("drivers.sections.licence")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<DriverFormInput> name="licence_no" label={t("drivers.licenceNo")} />
            <TextInputField<DriverFormInput>
              name="licence_expiry"
              label={t("drivers.licenceExpiry")}
              type="date"
            />
          </div>
        </FormSection>
        <FormSection title={t("drivers.sections.account")}>
          <TextInputField<DriverFormInput>
            name="login_email"
            label={t("drivers.loginEmail")}
            type="email"
            help={t("drivers.loginEmailHelp")}
          />
          <TextInputField<DriverFormInput> name="notes" label={t("fields.notes")} />
          <SwitchField<DriverFormInput> name="is_active" label={t("drivers.active")} />
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

export function VehicleForm({
  defaultValues,
  categories,
  models,
  drivers,
  editHref,
  deleteButton,
}: {
  defaultValues: VehicleFormInput;
  categories: { value: string; label: LocalizedJson }[];
  models: { value: string; label: string; categoryId: string }[];
  drivers: { value: string; label: string }[];
  editHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("cabsAdmin");
  const form = useForm<VehicleFormInput>({
    resolver: zodResolver(vehicleFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useCabSave(form, saveVehicle, {
    isNew,
    afterCreate: (id) => (id ? `${editHref}/${id}` : editHref),
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  const categoryOptions = useLocalizedOptions(categories);
  const categoryId = form.watch("category_id");
  const modelId = form.watch("model_id");
  const visibleModels = models.filter((m) => m.categoryId === categoryId);

  // A model from another category is cleared when the category changes.
  useEffect(() => {
    if (modelId && !models.some((m) => m.value === modelId && m.categoryId === categoryId)) {
      form.setValue("model_id", "", { shouldDirty: true });
    }
  }, [categoryId, form, modelId, models]);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("vehicles.sections.vehicle")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<VehicleFormInput>
              name="registration_no"
              label={t("vehicles.registration")}
              placeholder="UP85 AB 1234"
              help={t("vehicles.registrationHelp")}
            />
            <SelectField<VehicleFormInput>
              name="category_id"
              label={t("vehicles.category")}
              options={categoryOptions}
            />
            <SelectField<VehicleFormInput>
              name="model_id"
              label={t("vehicles.model")}
              options={[{ value: "", label: t("vehicles.noModel") }, ...visibleModels]}
            />
            <SelectField<VehicleFormInput>
              name="fuel"
              label={t("categories.fuel")}
              options={FUEL_TYPES.map((f) => ({ value: f, label: t(`fuels.${f}`) }))}
            />
            <TextInputField<VehicleFormInput> name="colour" label={t("vehicles.colour")} />
            <TextInputField<VehicleFormInput> name="year" label={t("vehicles.year")} placeholder="2023" />
            <SelectField<VehicleFormInput>
              name="default_driver_id"
              label={t("vehicles.defaultDriver")}
              options={[{ value: "", label: t("vehicles.noDriver") }, ...drivers]}
            />
          </div>
        </FormSection>
        <FormSection title={t("vehicles.sections.papers")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(["rc", "insurance", "permit", "puc", "fitness"] as const).map((paper) => (
              <TextInputField<VehicleFormInput>
                key={paper}
                name={`${paper}_expiry`}
                label={t("expiry.until", { paper: t(`expiry.papers.${paper}`) })}
                type="date"
              />
            ))}
          </div>
        </FormSection>
        <FormSection title={t("fields.other")}>
          <TextInputField<VehicleFormInput> name="notes" label={t("fields.notes")} />
          <SwitchField<VehicleFormInput> name="is_active" label={t("vehicles.active")} />
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}
