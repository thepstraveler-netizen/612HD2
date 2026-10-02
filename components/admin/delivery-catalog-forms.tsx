"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { saveDeliveryZone, saveRider } from "@/lib/delivery/admin-actions";
import {
  deliveryZoneFormSchema,
  riderFormSchema,
  type DeliveryZoneFormInput,
  type RiderFormInput,
} from "@/schemas/delivery-admin";
import { useDeliverySave } from "./delivery-shared";
import {
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import { FormSection, SubmitBar } from "./hotel-shared";

/** Delivery zones and riders. */

type Option = { value: string; label: string };

export function DeliveryZoneForm({
  defaultValues,
  listHref,
  deleteButton,
}: {
  defaultValues: DeliveryZoneFormInput;
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("deliveryAdmin");
  const form = useForm<DeliveryZoneFormInput>({
    resolver: zodResolver(deliveryZoneFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useDeliverySave(form, saveDeliveryZone, {
    isNew,
    afterCreate: () => listHref,
  });
  useUnsavedChangesWarning(form.formState.isDirty);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("zones.sections.zone")}>
          <LocalizedField<DeliveryZoneFormInput> name="name" label={t("fields.name")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<DeliveryZoneFormInput>
              name="slug"
              label={t("fields.slug")}
              placeholder="vrindavan"
              help={t("fields.slugHelp")}
            />
            <TextInputField<DeliveryZoneFormInput>
              name="eta_minutes"
              label={t("zones.eta")}
              help={t("zones.etaHelp")}
              type="number"
            />
            <TextInputField<DeliveryZoneFormInput>
              name="fee"
              label={t("zones.fee")}
              help={t("fields.rupees")}
            />
            <TextInputField<DeliveryZoneFormInput>
              name="free_above"
              label={t("zones.freeAbove")}
              help={t("zones.freeAboveHelp")}
            />
            <TextInputField<DeliveryZoneFormInput>
              name="sort_order"
              label={t("fields.sortOrder")}
              type="number"
            />
          </div>
          <SwitchField<DeliveryZoneFormInput> name="is_active" label={t("fields.active")} />
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

export function RiderForm({
  defaultValues,
  vendors,
  listHref,
  deleteButton,
}: {
  defaultValues: RiderFormInput;
  vendors: Option[];
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("deliveryAdmin");
  const form = useForm<RiderFormInput>({
    resolver: zodResolver(riderFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useDeliverySave(form, saveRider, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("riders.sections.rider")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<RiderFormInput> name="full_name" label={t("riders.name")} />
            <TextInputField<RiderFormInput> name="phone" label={t("fields.phone")} type="tel" />
            <TextInputField<RiderFormInput>
              name="vehicle"
              label={t("riders.vehicle")}
              placeholder="Bike · UP85 AB 1234"
            />
            <SelectField<RiderFormInput>
              name="vendor_id"
              label={t("riders.vendor")}
              options={[{ value: "", label: t("riders.platform") }, ...vendors]}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("riders.vendorHelp")}</p>
          <TextInputField<RiderFormInput> name="notes" label={t("fields.notes")} />
          <SwitchField<RiderFormInput> name="is_active" label={t("fields.active")} />
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}
