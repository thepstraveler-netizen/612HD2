"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { saveDeliverySettings } from "@/lib/delivery/admin-actions";
import {
  CANCEL_UNTIL,
  deliverySettingsFormSchema,
  type DeliverySettingsFormInput,
} from "@/schemas/delivery-admin";
import {
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import { useSave } from "./use-save";

/** Settings → Delivery: the `delivery.defaults` row (food, essentials and medicine). */
export function DeliverySettingsForm({ defaultValues }: { defaultValues: DeliverySettingsFormInput }) {
  const t = useTranslations();
  const form = useForm<DeliverySettingsFormInput>({
    resolver: zodResolver(deliverySettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveDeliverySettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  const s = (key: string) => t(`deliveryAdmin.settings.${key}`);
  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        className="grid max-w-3xl gap-4 rounded-2xl border bg-card p-4 sm:p-6"
        noValidate
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{s("title")}</h2>
          <p className="text-sm text-muted-foreground">{s("lead")}</p>
        </div>
        <SwitchField<DeliverySettingsFormInput> name="require_delivery_otp" label={s("requireOtp")} />
        <p className="-mt-2 text-xs text-muted-foreground">{s("requireOtpHelp")}</p>
        <SwitchField<DeliverySettingsFormInput> name="cod_enabled" label={s("codEnabled")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<DeliverySettingsFormInput>
            name="max_cod"
            label={s("maxCod")}
            help={s("maxCodHelp")}
          />
          <TextInputField<DeliverySettingsFormInput>
            name="hold_minutes"
            label={s("holdMinutes")}
            help={s("holdHelp")}
            type="number"
          />
          <TextInputField<DeliverySettingsFormInput>
            name="delivery_gst_percent"
            label={s("deliveryGst")}
            help={s("deliveryGstHelp")}
          />
          <TextInputField<DeliverySettingsFormInput>
            name="delivery_sac"
            label={s("deliverySac")}
            placeholder="996813"
          />
          <TextInputField<DeliverySettingsFormInput>
            name="food_sac"
            label={s("foodSac")}
            placeholder="996331"
          />
          <TextInputField<DeliverySettingsFormInput>
            name="goods_sac"
            label={s("goodsSac")}
            placeholder="996211"
          />
          <TextInputField<DeliverySettingsFormInput>
            name="quote_valid_hours"
            label={s("quoteHours")}
            help={s("quoteHoursHelp")}
            type="number"
          />
          <TextInputField<DeliverySettingsFormInput>
            name="max_items"
            label={s("maxItems")}
            help={s("maxItemsHelp")}
            type="number"
          />
          <SelectField<DeliverySettingsFormInput>
            name="cancel_until"
            label={s("cancelUntil")}
            options={CANCEL_UNTIL.map((c) => ({ value: c, label: s(`cancel.${c}`) }))}
          />
        </div>
        <LocalizedField<DeliverySettingsFormInput>
          name="medicine_notice"
          label={s("medicineNotice")}
          multiline
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {t("cms.actions.save")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
