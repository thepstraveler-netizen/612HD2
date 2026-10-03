"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { saveCoupon } from "@/lib/bookings/admin-actions";
import {
  BOOKING_SERVICES,
  COUPON_DISCOUNTS,
  couponFormSchema,
  type CouponFormInput,
} from "@/schemas/booking-admin";
import { useBookingsSave } from "./booking-shared";
import {
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import { CheckboxGroupField, FormSection, SubmitBar } from "./hotel-shared";
import { fromLocalInput, toLocalInput } from "./use-save";

/**
 * Coupon editor. Percent coupons are typed in % (stored as basis points),
 * flat ones and limits in rupees (stored as paise); the server action does
 * the conversion after validating again.
 */
export function CouponForm({
  defaultValues,
  hotels,
  listHref,
  deleteButton,
}: {
  defaultValues: CouponFormInput;
  hotels: { value: string; label: string }[];
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("bookingsAdmin");
  const form = useForm<CouponFormInput>({
    resolver: zodResolver(couponFormSchema, undefined, { raw: true }),
    defaultValues: {
      ...defaultValues,
      starts_at: toLocalInput(defaultValues.starts_at),
      ends_at: toLocalInput(defaultValues.ends_at),
    },
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useBookingsSave(form, saveCoupon, {
    isNew,
    afterCreate: () => listHref,
    transform: (v) => ({ ...v, starts_at: fromLocalInput(v.starts_at), ends_at: fromLocalInput(v.ends_at) }),
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  const type = form.watch("discount_type");

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("coupons.sections.code")}>
          <TextInputField<CouponFormInput>
            name="code"
            label={t("coupons.fields.code")}
            placeholder="RADHE10"
            help={t("coupons.fields.codeHelp")}
          />
          <LocalizedField<CouponFormInput> name="description" label={t("coupons.fields.description")} />
        </FormSection>

        <FormSection title={t("coupons.sections.discount")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField<CouponFormInput>
              name="discount_type"
              label={t("coupons.fields.type")}
              options={COUPON_DISCOUNTS.map((d) => ({ value: d, label: t(`coupons.types.${d}`) }))}
            />
            <TextInputField<CouponFormInput>
              name="value"
              label={t(`coupons.fields.value.${type}`)}
              help={t(`coupons.fields.valueHelp.${type}`)}
            />
            {type === "percent" ? (
              <TextInputField<CouponFormInput>
                name="max_discount"
                label={t("coupons.fields.maxDiscount")}
                help={t("coupons.fields.optionalRupees")}
              />
            ) : null}
            <TextInputField<CouponFormInput>
              name="min_order"
              label={t("coupons.fields.minOrder")}
              help={t("coupons.fields.optionalRupees")}
            />
          </div>
        </FormSection>

        <FormSection title={t("coupons.sections.limits")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<CouponFormInput>
              name="starts_at"
              label={t("coupons.fields.startsAt")}
              type="datetime-local"
            />
            <TextInputField<CouponFormInput>
              name="ends_at"
              label={t("coupons.fields.endsAt")}
              type="datetime-local"
            />
            <TextInputField<CouponFormInput>
              name="usage_limit"
              label={t("coupons.fields.usageLimit")}
              help={t("coupons.fields.usageLimitHelp")}
            />
            <TextInputField<CouponFormInput>
              name="per_user_limit"
              label={t("coupons.fields.perUserLimit")}
              type="number"
            />
          </div>
          <SwitchField<CouponFormInput>
            name="first_booking_only"
            label={t("coupons.fields.firstBookingOnly")}
          />
        </FormSection>

        <FormSection title={t("coupons.sections.scope")}>
          <CheckboxGroupField<CouponFormInput, (typeof BOOKING_SERVICES)[number]>
            name="services"
            label={t("coupons.fields.services")}
            options={BOOKING_SERVICES.map((s) => ({ value: s, label: t(`services.${s}`) }))}
          />
          <p className="-mt-2 text-xs text-muted-foreground">{t("coupons.fields.emptyMeansAll")}</p>
          {hotels.length ? (
            <div className="max-h-72 overflow-y-auto rounded-xl border p-3">
              <CheckboxGroupField<CouponFormInput, string>
                name="hotel_ids"
                label={t("coupons.fields.hotels")}
                options={hotels}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("coupons.fields.noHotels")}</p>
          )}
          <p className="-mt-2 text-xs text-muted-foreground">{t("coupons.fields.emptyMeansAll")}</p>
        </FormSection>

        <FormSection title={t("coupons.sections.visibility")}>
          <SwitchField<CouponFormInput> name="is_public" label={t("coupons.fields.isPublic")} />
          <p className="-mt-2 text-xs text-muted-foreground">{t("coupons.fields.isPublicHelp")}</p>
          <SwitchField<CouponFormInput> name="is_active" label={t("coupons.fields.active")} />
        </FormSection>

        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}
