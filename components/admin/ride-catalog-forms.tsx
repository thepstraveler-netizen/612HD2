"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { ICON_NAMES } from "@/lib/icons";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { savePoint, saveRideVehicle, saveVehicleType, saveZone } from "@/lib/rides/admin-actions";
import {
  FUEL_TYPES,
  RIDE_POINT_KINDS,
  pointFormSchema,
  rideVehicleFormSchema,
  vehicleTypeFormSchema,
  zoneFormSchema,
  type PointFormInput,
  type RideVehicleFormInput,
  type VehicleTypeFormInput,
  type ZoneFormInput,
} from "@/schemas/ride-admin";
import {
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import { FormSection, SubmitBar, useLocalizedOptions } from "./hotel-shared";
import { useRideSave } from "./ride-shared";

/** Vehicle types, zones, landmarks and ride vehicles: the rides catalog and fleet forms. */

type Option = { value: string; label: string };
type LocalizedOption = { value: string; label: LocalizedJson };

// ---------------------------------------------------------------- vehicle types

export function VehicleTypeForm({
  defaultValues,
  services,
  listHref,
  deleteButton,
}: {
  defaultValues: VehicleTypeFormInput;
  services: Option[];
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("admin.rides");
  const form = useForm<VehicleTypeFormInput>({
    resolver: zodResolver(vehicleTypeFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useRideSave(form, saveVehicleType, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("types.sections.type")}>
          <LocalizedField<VehicleTypeFormInput> name="name" label={t("fields.name")} />
          <LocalizedField<VehicleTypeFormInput>
            name="description"
            label={t("fields.description")}
            multiline
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<VehicleTypeFormInput>
              name="key"
              label={t("fields.key")}
              placeholder="e-rickshaw"
              help={t("fields.slugHelp")}
            />
            <SelectField<VehicleTypeFormInput>
              name="service_slug"
              label={t("types.service")}
              options={services}
            />
            <SelectField<VehicleTypeFormInput>
              name="icon"
              label={t("types.icon")}
              options={ICON_NAMES.map((i) => ({ value: i, label: i }))}
            />
            <TextInputField<VehicleTypeFormInput> name="seats" label={t("types.seats")} type="number" />
            <TextInputField<VehicleTypeFormInput>
              name="gst_percent"
              label={t("types.gst")}
              help={t("types.gstHelp")}
            />
            <TextInputField<VehicleTypeFormInput>
              name="sort_order"
              label={t("fields.sortOrder")}
              type="number"
            />
          </div>
          <SwitchField<VehicleTypeFormInput> name="instant_book" label={t("types.instantBook")} />
          <p className="text-xs text-muted-foreground">{t("types.instantBookHelp")}</p>
          <SwitchField<VehicleTypeFormInput> name="is_active" label={t("fields.active")} />
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

// ---------------------------------------------------------------- zones

export function ZoneForm({
  defaultValues,
  listHref,
  deleteButton,
}: {
  defaultValues: ZoneFormInput;
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("admin.rides");
  const form = useForm<ZoneFormInput>({
    resolver: zodResolver(zoneFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useRideSave(form, saveZone, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("zones.sections.zone")}>
          <LocalizedField<ZoneFormInput> name="name" label={t("fields.name")} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInputField<ZoneFormInput>
              name="slug"
              label={t("fields.slug")}
              placeholder="vrindavan"
              help={t("fields.slugHelp")}
            />
            <TextInputField<ZoneFormInput> name="lat" label={t("fields.lat")} placeholder="27.5800" />
            <TextInputField<ZoneFormInput> name="lng" label={t("fields.lng")} placeholder="77.7000" />
            <TextInputField<ZoneFormInput>
              name="radius_km"
              label={t("zones.radius")}
              help={t("zones.radiusHelp")}
            />
            <TextInputField<ZoneFormInput> name="sort_order" label={t("fields.sortOrder")} type="number" />
          </div>
          <p className="text-xs text-muted-foreground">{t("fields.coordsHelp")}</p>
          <SwitchField<ZoneFormInput> name="is_active" label={t("fields.active")} />
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

// ---------------------------------------------------------------- landmarks

export function PointForm({
  defaultValues,
  zones,
  listHref,
  deleteButton,
}: {
  defaultValues: PointFormInput;
  zones: LocalizedOption[];
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("admin.rides");
  const form = useForm<PointFormInput>({
    resolver: zodResolver(pointFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useRideSave(form, savePoint, {
    isNew,
    afterCreate: () => `${listHref}?zone=${form.getValues("zone_id")}`,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  const zoneOptions = useLocalizedOptions(zones);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("points.sections.point")}>
          <LocalizedField<PointFormInput> name="name" label={t("fields.name")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField<PointFormInput> name="zone_id" label={t("points.zone")} options={zoneOptions} />
            <SelectField<PointFormInput>
              name="kind"
              label={t("points.kind")}
              options={RIDE_POINT_KINDS.map((k) => ({ value: k, label: t(`points.kinds.${k}`) }))}
            />
            <TextInputField<PointFormInput>
              name="slug"
              label={t("fields.slug")}
              placeholder="banke-bihari-temple"
              help={t("fields.slugHelp")}
            />
            <TextInputField<PointFormInput> name="sort_order" label={t("fields.sortOrder")} type="number" />
            <TextInputField<PointFormInput> name="lat" label={t("fields.lat")} placeholder="27.5806" />
            <TextInputField<PointFormInput> name="lng" label={t("fields.lng")} placeholder="77.7006" />
          </div>
          <p className="text-xs text-muted-foreground">{t("fields.coordsHelp")}</p>
          <div className="flex flex-wrap gap-6">
            <SwitchField<PointFormInput> name="is_popular" label={t("fields.popular")} />
            <SwitchField<PointFormInput> name="is_active" label={t("fields.active")} />
          </div>
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

// ---------------------------------------------------------------- ride vehicles

export function RideVehicleForm({
  defaultValues,
  types,
  drivers,
  listHref,
  deleteButton,
}: {
  defaultValues: RideVehicleFormInput;
  types: LocalizedOption[];
  drivers: Option[];
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("admin.rides");
  const tc = useTranslations("cabsAdmin");
  const form = useForm<RideVehicleFormInput>({
    resolver: zodResolver(rideVehicleFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useRideSave(form, saveRideVehicle, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);
  const typeOptions = useLocalizedOptions(types);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("vehicles.sections.vehicle")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField<RideVehicleFormInput>
              name="ride_vehicle_type_id"
              label={t("vehicles.type")}
              options={typeOptions}
            />
            <TextInputField<RideVehicleFormInput>
              name="registration_no"
              label={t("vehicles.registration")}
              placeholder="UP85 AB 1234"
              help={t("vehicles.registrationHelp")}
            />
            <TextInputField<RideVehicleFormInput> name="colour" label={t("vehicles.colour")} />
            <SelectField<RideVehicleFormInput>
              name="fuel"
              label={t("vehicles.fuel")}
              options={FUEL_TYPES.map((f) => ({ value: f, label: tc(`fuels.${f}`) }))}
            />
            <SelectField<RideVehicleFormInput>
              name="default_driver_id"
              label={t("vehicles.defaultDriver")}
              options={[{ value: "", label: t("vehicles.noDriver") }, ...drivers]}
            />
          </div>
        </FormSection>
        <FormSection title={t("vehicles.sections.papers")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(["rc", "insurance", "permit", "puc", "fitness"] as const).map((paper) => (
              <TextInputField<RideVehicleFormInput>
                key={paper}
                name={`${paper}_expiry`}
                label={tc("expiry.until", { paper: tc(`expiry.papers.${paper}`) })}
                type="date"
              />
            ))}
          </div>
        </FormSection>
        <FormSection title={t("vehicles.sections.other")}>
          <TextInputField<RideVehicleFormInput> name="notes" label={t("fields.notes")} />
          <SwitchField<RideVehicleFormInput> name="is_active" label={t("fields.active")} />
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}
