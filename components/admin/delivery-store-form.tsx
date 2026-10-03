"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { CopyCheck, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { FormProvider, useFieldArray, useForm, useFormContext, useFormState } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  registerDeliveryMedia,
  registerPharmacyMedia,
  savePharmacy,
  saveStore,
} from "@/lib/delivery/admin-actions";
import { copyDayToAll } from "@/lib/delivery/admin-rows";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { FOOD_KINDS, storeFormSchema, type StoreFormInput } from "@/schemas/delivery-admin";
import { useDeliverySave } from "./delivery-shared";
import {
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import { CheckboxGroupField, FormSection, SubmitBar, useLocalizedOptions } from "./hotel-shared";
import { ImageUploader } from "./image-uploader";

type Option = { value: string; label: string };
type LocalizedOption = { value: string; label: LocalizedJson };

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Weekly opening slots (India time); several slots a day, and slots past midnight, are fine. */
function HoursEditor() {
  const t = useTranslations("deliveryAdmin.stores");
  const { control, register, getValues, setValue, watch } = useFormContext<StoreFormInput>();
  const { errors } = useFormState<StoreFormInput>();
  const slots = useFieldArray({ control, name: "hours", keyName: "key" });
  const is24x7 = watch("is_24x7");
  const [copyFrom, setCopyFrom] = useState(1);
  if (is24x7) return <p className="text-sm text-muted-foreground">{t("hours24x7")}</p>;

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">{t("hoursHelp")}</p>
      {slots.fields.length === 0 ? <p className="text-sm text-accent-amber">{t("hoursNone")}</p> : null}
      {slots.fields.map((field, index) => {
        const error = errors.hours?.[index];
        return (
          <div
            key={field.key}
            className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[10rem_8rem_8rem_auto]"
          >
            <label className="col-span-2 grid gap-1 text-xs text-muted-foreground sm:col-span-1">
              {t("day")}
              <NativeSelect {...register(`hours.${index}.day`, { valueAsNumber: true })}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {t(`days.${d}`)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t("opens")}
              <Input type="time" aria-invalid={!!error?.open} {...register(`hours.${index}.open`)} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t("closes")}
              <Input type="time" aria-invalid={!!error?.close} {...register(`hours.${index}.close`)} />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("removeSlot")}
              onClick={() => slots.remove(index)}
            >
              <Trash2 />
            </Button>
            {error ? <p className="col-span-full text-sm text-destructive">{t("slotInvalid")}</p> : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            slots.append({ day: Number(getValues("hours").at(-1)?.day ?? 1), open: "09:00", close: "22:00" })
          }
          disabled={slots.fields.length >= 21}
        >
          <Plus /> {t("addSlot")}
        </Button>
        <NativeSelect
          aria-label={t("copyFrom")}
          className="w-auto"
          value={copyFrom}
          onChange={(e) => setCopyFrom(Number(e.target.value))}
        >
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {t(`days.${d}`)}
            </option>
          ))}
        </NativeSelect>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setValue("hours", copyDayToAll(getValues("hours"), copyFrom), { shouldDirty: true })}
        >
          <CopyCheck /> {t("copyToAll")}
        </Button>
      </div>
    </div>
  );
}

/**
 * A restaurant, grocery store or partner pharmacy: owner, details, image,
 * weekly hours, ordering terms, served zones and visibility. Pharmacies
 * need their drug licence number (D-062).
 */
export function DeliveryStoreForm({
  defaultValues,
  vendors,
  zones,
  imageUrl,
  listHref,
  mode,
  deleteButton,
}: {
  defaultValues: StoreFormInput;
  vendors: Option[];
  zones: LocalizedOption[];
  imageUrl: string | null;
  listHref: string;
  mode: "food" | "pharmacy";
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("deliveryAdmin");
  const form = useForm<StoreFormInput>({
    resolver: zodResolver(storeFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const pharmacy = mode === "pharmacy";
  const { pending, onSubmit } = useDeliverySave(form, pharmacy ? savePharmacy : saveStore, {
    isNew,
    afterCreate: (id) => (id ? `${listHref}/${id}` : listHref),
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  const zoneOptions = useLocalizedOptions(zones);
  const [preview, setPreview] = useState(imageUrl);
  const imageId = form.watch("image_id");
  const name = form.watch("name");
  const kind = form.watch("kind");

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <FormSection title={t("stores.sections.store")}>
          <LocalizedField<StoreFormInput> name="name" label={t("fields.name")} />
          <LocalizedField<StoreFormInput> name="description" label={t("fields.description")} multiline />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField<StoreFormInput>
              name="vendor_id"
              label={t("stores.vendor")}
              options={[{ value: "", label: t("stores.pickVendor") }, ...vendors]}
            />
            {pharmacy ? (
              <TextInputField<StoreFormInput>
                name="drug_licence_no"
                label={t("stores.drugLicence")}
                help={t("stores.drugLicenceHelp")}
              />
            ) : (
              <SelectField<StoreFormInput>
                name="kind"
                label={t("stores.kind")}
                options={FOOD_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
              />
            )}
            <TextInputField<StoreFormInput>
              name="slug"
              label={t("fields.slug")}
              placeholder={pharmacy ? "shri-medicos" : "brijwasi-sweets"}
              help={t("fields.slugHelp")}
            />
            {kind === "restaurant" ? (
              <TextInputField<StoreFormInput>
                name="cuisines"
                label={t("stores.cuisines")}
                placeholder="North Indian, Sweets"
                help={t("stores.cuisinesHelp")}
              />
            ) : null}
            <TextInputField<StoreFormInput> name="phone" label={t("fields.phone")} type="tel" />
            <TextInputField<StoreFormInput> name="address" label={t("fields.address")} />
            <TextInputField<StoreFormInput> name="lat" label={t("fields.lat")} placeholder="27.5800" />
            <TextInputField<StoreFormInput> name="lng" label={t("fields.lng")} placeholder="77.7000" />
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t("fields.image")}</span>
            <ImageUploader
              value={imageId}
              previewUrl={preview}
              collection="stores"
              alt={{ en: name?.en || "Store", hi: name?.hi || null }}
              register={pharmacy ? registerPharmacyMedia : registerDeliveryMedia}
              onChange={(id, url) => {
                form.setValue("image_id", id ?? "", { shouldDirty: true });
                setPreview(url);
              }}
            />
          </div>
          {kind === "restaurant" ? (
            <SwitchField<StoreFormInput> name="pure_veg" label={t("stores.pureVeg")} />
          ) : null}
        </FormSection>

        <FormSection title={t("stores.sections.hours")}>
          <SwitchField<StoreFormInput> name="is_24x7" label={t("stores.is24x7")} />
          <HoursEditor />
        </FormSection>

        <FormSection title={t("stores.sections.ordering")}>
          <SwitchField<StoreFormInput> name="accepting_orders" label={t("stores.accepting")} />
          <p className="text-xs text-muted-foreground">{t("stores.acceptingHelp")}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextInputField<StoreFormInput>
              name="prep_minutes"
              label={t("stores.prepMinutes")}
              type="number"
            />
            <TextInputField<StoreFormInput>
              name="min_order"
              label={t("stores.minOrder")}
              help={t("fields.rupees")}
            />
            {!pharmacy ? (
              <TextInputField<StoreFormInput>
                name="packaging_fee"
                label={t("stores.packagingFee")}
                help={t("fields.rupees")}
              />
            ) : null}
            <TextInputField<StoreFormInput>
              name="gst_percent"
              label={t("stores.gst")}
              help={t("stores.gstHelp")}
            />
          </div>
        </FormSection>

        <FormSection title={t("stores.sections.zones")}>
          {zoneOptions.length === 0 ? (
            <p className="text-sm text-accent-amber">{t("stores.noZones")}</p>
          ) : (
            <CheckboxGroupField<StoreFormInput, string>
              name="zone_ids"
              label={t("stores.zones")}
              options={zoneOptions}
            />
          )}
        </FormSection>

        <FormSection title={t("stores.sections.visibility")}>
          <div className="flex flex-wrap items-end gap-6">
            <TextInputField<StoreFormInput>
              name="sort_order"
              label={t("fields.sortOrder")}
              type="number"
              className="w-28"
            />
            <SwitchField<StoreFormInput> name="is_featured" label={t("fields.featured")} />
            <SwitchField<StoreFormInput> name="is_active" label={t("fields.active")} />
          </div>
        </FormSection>
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}
