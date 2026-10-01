"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { savePricingRule } from "@/lib/hotels/actions";
import { pricingRuleFormSchema, type PricingRuleFormInput } from "@/schemas/hotels";
import { SelectField, SwitchField, TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { FormSection, SubmitBar, useHotelSave, WeekdayToggles } from "./hotel-shared";

export function PricingRuleForm({
  defaultValues,
  rooms,
  plans,
  listHref,
  deleteButton,
}: {
  defaultValues: PricingRuleFormInput;
  rooms: { value: string; label: string }[];
  /** Plans with their room, labelled "Room · Plan". */
  plans: { value: string; label: string; roomId: string }[];
  listHref: string;
  deleteButton?: React.ReactNode;
}) {
  const t = useTranslations("hotelsAdmin.pricing");
  const form = useForm<PricingRuleFormInput>({
    resolver: zodResolver(pricingRuleFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useHotelSave(form, savePricingRule, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);

  const roomId = form.watch("room_id");
  const planId = form.watch("rate_plan_id");
  const adjustment = form.watch("adjustment");
  const visiblePlans = roomId ? plans.filter((p) => p.roomId === roomId) : plans;
  // A plan from another room is cleared when the room scope changes.
  useEffect(() => {
    if (planId && roomId && !plans.some((p) => p.value === planId && p.roomId === roomId)) {
      form.setValue("rate_plan_id", "", { shouldDirty: true });
    }
  }, [form, planId, plans, roomId]);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("sections.rule")}>
          <TextInputField<PricingRuleFormInput> name="name" label={t("name")} placeholder="Holi 2027" />
          <div className="grid grid-cols-2 gap-4">
            <TextInputField<PricingRuleFormInput> name="start_date" label={t("start")} type="date" />
            <TextInputField<PricingRuleFormInput> name="end_date" label={t("end")} type="date" />
          </div>
          <WeekdayToggles<PricingRuleFormInput> name="weekdays" label={t("weekdays")} />
        </FormSection>

        <FormSection title={t("sections.price")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField<PricingRuleFormInput>
              name="adjustment"
              label={t("adjustment")}
              options={(["percent", "flat", "fixed"] as const).map((a) => ({
                value: a,
                label: t(`adjustments.${a}`),
              }))}
            />
            <TextInputField<PricingRuleFormInput>
              name="amount"
              label={t(`amount.${adjustment}`)}
              help={t(`amountHelp.${adjustment}`)}
            />
            <TextInputField<PricingRuleFormInput>
              name="priority"
              label={t("priority")}
              type="number"
              help={t("priorityHelp")}
            />
          </div>
        </FormSection>

        <FormSection title={t("sections.scope")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField<PricingRuleFormInput>
              name="room_id"
              label={t("room")}
              options={[{ value: "", label: t("allRooms") }, ...rooms]}
            />
            <SelectField<PricingRuleFormInput>
              name="rate_plan_id"
              label={t("plan")}
              options={[{ value: "", label: t("allPlans") }, ...visiblePlans]}
            />
          </div>
          <SwitchField<PricingRuleFormInput> name="is_active" label={t("active")} />
        </FormSection>

        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}
