"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormProvider, useFieldArray, useForm, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { saveRoom } from "@/lib/hotels/actions";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { MEAL_PLANS, roomFormSchema, type RoomFormInput } from "@/schemas/hotels";
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
  useHotelSave,
  useLocalizedOptions,
} from "./hotel-shared";

function Inclusions({ form, planIndex }: { form: UseFormReturn<RoomFormInput>; planIndex: number }) {
  const t = useTranslations("hotelsAdmin.rooms");
  const list = useFieldArray({ control: form.control, name: `plans.${planIndex}.inclusions` as never });
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm font-medium">{t("inclusions")}</legend>
      {list.fields.map((field, index) => (
        <div key={field.id} className="flex items-start gap-2">
          <LocalizedField<RoomFormInput>
            name={`plans.${planIndex}.inclusions.${index}` as "name"}
            label={`#${index + 1}`}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("remove")}
            onClick={() => list.remove(index)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {list.fields.length < 10 ? (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() => list.append({ en: "", hi: "" } as never)}
        >
          <Plus /> {t("addInclusion")}
        </Button>
      ) : null}
    </fieldset>
  );
}

export function RoomForm({
  defaultValues,
  newPlan,
  amenities,
  listHref,
  deleteButton,
}: {
  defaultValues: RoomFormInput;
  newPlan: RoomFormInput["plans"][number];
  amenities: { value: string; label: LocalizedJson }[];
  listHref: string;
  deleteButton?: React.ReactNode;
}) {
  const t = useTranslations("hotelsAdmin");
  const form = useForm<RoomFormInput>({
    resolver: zodResolver(roomFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const plans = useFieldArray({ control: form.control, name: "plans", keyName: "key" });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useHotelSave(form, saveRoom, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);
  const amenityOptions = useLocalizedOptions(amenities);
  const plansError = form.formState.errors.plans?.root?.message ?? form.formState.errors.plans?.message;

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <FormSection title={t("rooms.sections.room")}>
          <LocalizedField<RoomFormInput> name="name" label={t("rooms.name")} />
          <LocalizedField<RoomFormInput> name="description" label={t("rooms.description")} multiline />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextInputField<RoomFormInput> name="bed_type" label={t("rooms.bedType")} placeholder="King" />
            <TextInputField<RoomFormInput> name="size_sqft" label={t("rooms.size")} />
            <TextInputField<RoomFormInput>
              name="total_units"
              label={t("rooms.totalUnits")}
              type="number"
              help={t("rooms.totalUnitsHelp")}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <TextInputField<RoomFormInput>
              name="base_occupancy"
              label={t("rooms.baseOccupancy")}
              type="number"
            />
            <TextInputField<RoomFormInput> name="max_adults" label={t("rooms.maxAdults")} type="number" />
            <TextInputField<RoomFormInput> name="max_children" label={t("rooms.maxChildren")} type="number" />
            <TextInputField<RoomFormInput>
              name="max_occupancy"
              label={t("rooms.maxOccupancy")}
              type="number"
            />
          </div>
          <CheckboxGroupField<RoomFormInput, string>
            name="amenity_ids"
            label={t("rooms.amenities")}
            options={amenityOptions}
          />
          <div className="flex flex-wrap items-end gap-6">
            <TextInputField<RoomFormInput>
              name="sort_order"
              label={t("fields.sortOrder")}
              type="number"
              className="w-28"
            />
            <SwitchField<RoomFormInput> name="is_active" label={t("rooms.active")} />
          </div>
        </FormSection>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("rooms.plansTitle")}</h2>
            {plans.fields.length < 8 ? (
              <Button type="button" variant="outline" onClick={() => plans.append(newPlan)}>
                <Plus /> {t("rooms.addPlan")}
              </Button>
            ) : null}
          </div>
          {plansError ? (
            <p className="text-sm text-destructive">
              {t.has(`errors.${plansError}`) ? t(`errors.${plansError}`) : t("errors.needPlan")}
            </p>
          ) : null}
          {plans.fields.map((field, index) => {
            const refundable = form.watch(`plans.${index}.is_refundable`);
            return (
              <FormSection key={field.key} title={t("rooms.planN", { n: index + 1 })}>
                <LocalizedField<RoomFormInput> name={`plans.${index}.name`} label={t("rooms.planName")} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <SelectField<RoomFormInput>
                    name={`plans.${index}.meal_plan`}
                    label={t("rooms.mealPlan")}
                    options={MEAL_PLANS.map((m) => ({ value: m, label: t(`mealPlans.${m}`) }))}
                  />
                  <TextInputField<RoomFormInput>
                    name={`plans.${index}.base_price`}
                    label={t("rooms.basePrice")}
                    help={t("fields.rupeesHelp")}
                  />
                  <TextInputField<RoomFormInput>
                    name={`plans.${index}.extra_adult`}
                    label={t("rooms.extraAdult")}
                  />
                  <TextInputField<RoomFormInput>
                    name={`plans.${index}.extra_child`}
                    label={t("rooms.extraChild")}
                  />
                  <TextInputField<RoomFormInput>
                    name={`plans.${index}.min_stay`}
                    label={t("rooms.minStay")}
                    type="number"
                  />
                  <TextInputField<RoomFormInput>
                    name={`plans.${index}.max_stay`}
                    label={t("rooms.maxStay")}
                  />
                </div>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                  <SwitchField<RoomFormInput>
                    name={`plans.${index}.is_refundable`}
                    label={t("rooms.refundable")}
                  />
                  {refundable ? (
                    <TextInputField<RoomFormInput>
                      name={`plans.${index}.free_cancel_hours`}
                      label={t("rooms.freeCancelHours")}
                      help={t("rooms.freeCancelHelp")}
                      className="w-60"
                    />
                  ) : null}
                  <SwitchField<RoomFormInput> name={`plans.${index}.is_active`} label={t("rooms.active")} />
                </div>
                <Inclusions form={form} planIndex={index} />
                {plans.fields.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit text-destructive"
                    onClick={() => plans.remove(index)}
                  >
                    <Trash2 /> {t("rooms.removePlan")}
                  </Button>
                ) : null}
              </FormSection>
            );
          })}
        </div>

        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}
