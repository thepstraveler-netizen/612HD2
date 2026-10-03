"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveLoyaltySettings, saveReviewsSettings } from "@/lib/engagement/settings-actions";
import { BOOKING_SERVICES } from "@/schemas/booking-admin";
import {
  loyaltySettingsFormSchema,
  reviewsSettingsFormSchema,
  type LoyaltySettingsFormInput,
  type ReviewsSettingsFormInput,
} from "@/schemas/engagement-admin";
import { SwitchField, TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { useSave } from "./use-save";

/**
 * Settings → Reviews & rewards: `reviews.defaults` (moderation, review
 * window, photo limits) and `loyalty.defaults` (P&S Rewards earning,
 * redemption, expiry, review and referral bonuses). Each form saves on its
 * own with settings.write.
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
        <h3 className="text-lg font-semibold">{title}</h3>
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

function ReviewsDefaultsForm({ defaultValues }: { defaultValues: ReviewsSettingsFormInput }) {
  const t = useTranslations("engagementSettings.reviews");
  const form = useForm<ReviewsSettingsFormInput>({
    resolver: zodResolver(reviewsSettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveReviewsSettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <SettingsCard title={t("title")} lead={t("lead")} pending={pending} onSubmit={onSubmit}>
        <div className="grid gap-1">
          <SwitchField<ReviewsSettingsFormInput> name="auto_publish" label={t("autoPublish")} />
          <p className="text-xs text-muted-foreground">{t("autoPublishHelp")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<ReviewsSettingsFormInput>
            name="window_days"
            type="number"
            label={t("windowDays")}
            help={t("windowDaysHelp")}
          />
          <TextInputField<ReviewsSettingsFormInput>
            name="min_body_chars"
            type="number"
            label={t("minBodyChars")}
            help={t("minBodyCharsHelp")}
          />
          <TextInputField<ReviewsSettingsFormInput>
            name="max_photos"
            type="number"
            label={t("maxPhotos")}
            help={t("maxPhotosHelp")}
          />
          <TextInputField<ReviewsSettingsFormInput>
            name="max_photo_mb"
            label={t("maxPhotoMb")}
            help={t("maxPhotoMbHelp")}
          />
        </div>
      </SettingsCard>
    </FormProvider>
  );
}

function EarnServicesField() {
  const t = useTranslations("engagementSettings.loyalty");
  const services = useTranslations("bookingsAdmin.services");
  const { register } = useFormContext<LoyaltySettingsFormInput>();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{t("earnServices")}</legend>
      <div className="grid gap-2 sm:grid-cols-4">
        {BOOKING_SERVICES.map((s) => (
          <label
            key={s}
            htmlFor={`ls-svc-${s}`}
            className="flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm"
          >
            <input
              id={`ls-svc-${s}`}
              type="checkbox"
              value={s}
              className="size-4 accent-primary"
              {...register("earn_services")}
            />
            {services(s)}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("earnServicesHelp")}</p>
    </fieldset>
  );
}

function MaxRedeemField() {
  const t = useTranslations("engagementSettings");
  const cms = useTranslations("cms.errors");
  const { register, formState } = useFormContext<LoyaltySettingsFormInput>();
  const message = formState.errors.max_redeem_points?.message;
  const error = message
    ? t.has(`errors.${message}`)
      ? t(`errors.${message}`)
      : cms.has(message)
        ? cms(message)
        : message
    : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor="ls-max-redeem">{t("loyalty.maxRedeem")}</Label>
      <Input
        id="ls-max-redeem"
        inputMode="numeric"
        aria-invalid={!!error}
        {...register("max_redeem_points")}
      />
      <p className="text-xs text-muted-foreground">{t("loyalty.maxRedeemHelp")}</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function LoyaltyDefaultsForm({ defaultValues }: { defaultValues: LoyaltySettingsFormInput }) {
  const t = useTranslations("engagementSettings.loyalty");
  const form = useForm<LoyaltySettingsFormInput>({
    resolver: zodResolver(loyaltySettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveLoyaltySettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <SettingsCard title={t("title")} lead={t("lead")} pending={pending} onSubmit={onSubmit}>
        <SwitchField<LoyaltySettingsFormInput> name="enabled" label={t("enabled")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<LoyaltySettingsFormInput>
            name="point_value_rupees"
            label={t("pointValue")}
            help={t("pointValueHelp")}
          />
          <TextInputField<LoyaltySettingsFormInput>
            name="earn_percent"
            label={t("earnPercent")}
            help={t("earnPercentHelp")}
          />
        </div>
        <EarnServicesField />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<LoyaltySettingsFormInput>
            name="min_redeem_points"
            type="number"
            label={t("minRedeem")}
            help={t("minRedeemHelp")}
          />
          <MaxRedeemField />
          <TextInputField<LoyaltySettingsFormInput>
            name="code_valid_days"
            type="number"
            label={t("codeValidDays")}
            help={t("codeValidDaysHelp")}
          />
          <TextInputField<LoyaltySettingsFormInput>
            name="expiry_days"
            type="number"
            label={t("expiryDays")}
            help={t("expiryDaysHelp")}
          />
          <TextInputField<LoyaltySettingsFormInput>
            name="review_points"
            type="number"
            label={t("reviewPoints")}
            help={t("reviewPointsHelp")}
          />
        </div>
        <fieldset className="grid gap-3 rounded-xl border p-3">
          <legend className="px-1 text-sm font-medium">{t("referrals")}</legend>
          <SwitchField<LoyaltySettingsFormInput> name="referrals_enabled" label={t("referralsEnabled")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<LoyaltySettingsFormInput>
              name="referrer_points"
              type="number"
              label={t("referrerPoints")}
            />
            <TextInputField<LoyaltySettingsFormInput>
              name="referee_points"
              type="number"
              label={t("refereePoints")}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("referralsHelp")}</p>
        </fieldset>
        <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">{t("frozenNote")}</p>
      </SettingsCard>
    </FormProvider>
  );
}

export function EngagementSettingsForms({
  reviews,
  loyalty,
}: {
  reviews: ReviewsSettingsFormInput;
  loyalty: LoyaltySettingsFormInput;
}) {
  const t = useTranslations("engagementSettings");
  return (
    <section className="grid gap-4" aria-labelledby="engagement-settings">
      <h2 id="engagement-settings" className="text-[length:var(--text-heading,1.25rem)] font-semibold">
        {t("title")}
      </h2>
      <ReviewsDefaultsForm defaultValues={reviews} />
      <LoyaltyDefaultsForm defaultValues={loyalty} />
    </section>
  );
}
