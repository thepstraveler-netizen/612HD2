"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { saveInvoiceSettings, savePaymentSettings } from "@/lib/bookings/admin-actions";
import { saveBusinessProfile, setFeatureFlag } from "@/lib/cms/actions";
import {
  invoiceSettingsFormSchema,
  paymentSettingsFormSchema,
  type InvoiceSettingsFormInput,
  type PaymentSettingsFormInput,
} from "@/schemas/booking-admin";
import { businessProfileSchema, type BusinessProfile } from "@/schemas/cms";
import { SwitchField, TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { useSave } from "./use-save";

export function BusinessProfileForm({ defaultValues }: { defaultValues: BusinessProfile }) {
  const t = useTranslations("cms");
  const form = useForm<BusinessProfile>({
    resolver: zodResolver(businessProfileSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveBusinessProfile, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        className="grid max-w-3xl gap-4 rounded-2xl border bg-card p-4 sm:p-6"
        noValidate
      >
        <h2 className="text-lg font-semibold">{t("nav.business")}</h2>
        <TextInputField<BusinessProfile> name="name" label={t("fields.businessName")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<BusinessProfile>
            name="phone"
            label={t("fields.phone")}
            type="tel"
            placeholder="+91 98765 43210"
          />
          <TextInputField<BusinessProfile>
            name="whatsapp"
            label={t("fields.whatsapp")}
            type="tel"
            placeholder="919876543210"
          />
          <TextInputField<BusinessProfile> name="email" label={t("fields.email")} type="email" />
          <TextInputField<BusinessProfile> name="gstin" label={t("fields.gstin")} />
        </div>
        <TextInputField<BusinessProfile> name="address" label={t("fields.address")} />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

export type FlagRow = { key: string; enabled: boolean; description: string | null };

export function FeatureFlagList({ flags, canWrite }: { flags: FlagRow[]; canWrite: boolean }) {
  const t = useTranslations("cms");
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(flags, (state, next: { key: string; enabled: boolean }) =>
    state.map((f) => (f.key === next.key ? { ...f, enabled: next.enabled } : f)),
  );
  return (
    <section className="grid max-w-3xl gap-3 rounded-2xl border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{t("nav.flags")}</h2>
      <ul className="divide-y">
        {optimistic.map((flag) => (
          <li key={flag.key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-mono text-sm">{flag.key}</p>
              {flag.description ? <p className="text-sm text-muted-foreground">{flag.description}</p> : null}
            </div>
            <Switch
              checked={flag.enabled}
              disabled={!canWrite || pending}
              aria-label={flag.key}
              onCheckedChange={(enabled) =>
                startTransition(async () => {
                  setOptimistic({ key: flag.key, enabled });
                  const result = await setFeatureFlag({ key: flag.key, enabled });
                  if (result.ok) toast.success(t("actions.saved"));
                  else toast.error(t(`errors.${result.error}`));
                })
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `payments.defaults`: money in rupees and GST in %, stored as paise and basis points. */
export function PaymentSettingsForm({ defaultValues }: { defaultValues: PaymentSettingsFormInput }) {
  const t = useTranslations();
  const form = useForm<PaymentSettingsFormInput>({
    resolver: zodResolver(paymentSettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, savePaymentSettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        className="grid max-w-3xl gap-4 rounded-2xl border bg-card p-4 sm:p-6"
        noValidate
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t("bookingsAdmin.settings.payments.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("bookingsAdmin.settings.payments.lead")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<PaymentSettingsFormInput>
            name="advance_percent"
            label={t("bookingsAdmin.settings.payments.advancePercent")}
            help={t("bookingsAdmin.settings.payments.advanceHelp")}
            type="number"
          />
          <TextInputField<PaymentSettingsFormInput>
            name="hold_minutes"
            label={t("bookingsAdmin.settings.payments.holdMinutes")}
            help={t("bookingsAdmin.settings.payments.holdHelp")}
            type="number"
          />
          <TextInputField<PaymentSettingsFormInput>
            name="convenience_fee"
            label={t("bookingsAdmin.settings.payments.convenienceFee")}
            help={t("bookingsAdmin.settings.payments.convenienceFeeHelp")}
          />
          <TextInputField<PaymentSettingsFormInput>
            name="fee_tax_percent"
            label={t("bookingsAdmin.settings.payments.feeTax")}
          />
        </div>
        <SwitchField<PaymentSettingsFormInput>
          name="part_payment_enabled"
          label={t("bookingsAdmin.settings.payments.partPayment")}
        />
        <SwitchField<PaymentSettingsFormInput>
          name="pay_at_hotel_enabled"
          label={t("bookingsAdmin.settings.payments.payAtHotel")}
        />
        <SwitchField<PaymentSettingsFormInput>
          name="customer_cancellation_enabled"
          label={t("bookingsAdmin.settings.payments.customerCancellation")}
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

/** `business.invoice`: seller details and numbering printed on GST invoices. */
export function InvoiceSettingsForm({ defaultValues }: { defaultValues: InvoiceSettingsFormInput }) {
  const t = useTranslations();
  const form = useForm<InvoiceSettingsFormInput>({
    resolver: zodResolver(invoiceSettingsFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveInvoiceSettings, {
    listHref: "/admin/settings",
    isNew: false,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        className="grid max-w-3xl gap-4 rounded-2xl border bg-card p-4 sm:p-6"
        noValidate
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t("bookingsAdmin.settings.invoice.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("bookingsAdmin.settings.invoice.lead")}</p>
        </div>
        <TextInputField<InvoiceSettingsFormInput>
          name="legal_name"
          label={t("bookingsAdmin.settings.invoice.legalName")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<InvoiceSettingsFormInput>
            name="state"
            label={t("bookingsAdmin.settings.invoice.state")}
          />
          <TextInputField<InvoiceSettingsFormInput>
            name="state_code"
            label={t("bookingsAdmin.settings.invoice.stateCode")}
            placeholder="09"
          />
          <TextInputField<InvoiceSettingsFormInput>
            name="prefix"
            label={t("bookingsAdmin.settings.invoice.prefix")}
            help={t("bookingsAdmin.settings.invoice.prefixHelp")}
            placeholder="PST"
          />
          <TextInputField<InvoiceSettingsFormInput>
            name="sac_accommodation"
            label={t("bookingsAdmin.settings.invoice.sacAccommodation")}
            placeholder="996311"
          />
          <TextInputField<InvoiceSettingsFormInput>
            name="sac_services"
            label={t("bookingsAdmin.settings.invoice.sacServices")}
            placeholder="998552"
          />
        </div>
        <TextInputField<InvoiceSettingsFormInput>
          name="terms"
          label={t("bookingsAdmin.settings.invoice.terms")}
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
