"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveNotificationTemplate } from "@/lib/bookings/admin-actions";
import { samplePlaceholderValues } from "@/lib/bookings/admin-forms";
import { BOOKING_PLACEHOLDERS, renderTemplate, templatePlaceholders } from "@/lib/notifications/render";
import { NOTIFICATION_CHANNELS, templateFormSchema, type TemplateFormInput } from "@/schemas/booking-admin";
import { useBookingsSave } from "./booking-shared";
import { SelectField, SwitchField, TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { FormSection, SubmitBar } from "./hotel-shared";

/**
 * Template editor with the placeholders a booking message can use and a
 * live preview filled with sample values. Key, channel and language are
 * fixed once a template exists.
 */
export function NotificationTemplateForm({
  defaultValues,
  listHref,
  siteUrl,
}: {
  defaultValues: TemplateFormInput;
  listHref: string;
  siteUrl: string;
}) {
  const t = useTranslations("bookingsAdmin");
  const form = useForm<TemplateFormInput>({
    resolver: zodResolver(templateFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useBookingsSave(form, saveNotificationTemplate, {
    isNew,
    afterCreate: () => listHref,
  });
  useUnsavedChangesWarning(form.formState.isDirty);

  const channel = form.watch("channel");
  const locale = form.watch("locale");
  const subject = form.watch("subject") ?? "";
  const body = form.watch("body");
  const samples = useMemo(() => samplePlaceholderValues(locale, siteUrl), [locale, siteUrl]);
  const unknown = templatePlaceholders(`${subject} ${body}`).filter(
    (p) => !(BOOKING_PLACEHOLDERS as readonly string[]).includes(p),
  );
  const bodyError = form.formState.errors.body?.message;

  const insert = (name: string) => {
    const field = document.getElementById("f-body") as HTMLTextAreaElement | null;
    const token = `{{${name}}}`;
    const current = form.getValues("body");
    const at = field?.selectionStart ?? current.length;
    form.setValue("body", current.slice(0, at) + token + current.slice(at), { shouldDirty: true });
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-2" noValidate>
        <div className="grid content-start gap-5">
          <FormSection title={t("notifications.sections.template")}>
            {isNew ? (
              <>
                <TextInputField<TemplateFormInput>
                  name="key"
                  label={t("notifications.fields.key")}
                  placeholder="booking.confirmed"
                  help={t("notifications.fields.keyHelp")}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField<TemplateFormInput>
                    name="channel"
                    label={t("notifications.fields.channel")}
                    options={NOTIFICATION_CHANNELS.map((c) => ({ value: c, label: t(`channels.${c}`) }))}
                  />
                  <SelectField<TemplateFormInput>
                    name="locale"
                    label={t("notifications.fields.locale")}
                    options={(["en", "hi"] as const).map((l) => ({
                      value: l,
                      label: t(`notifications.locales.${l}`),
                    }))}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("notifications.fixedIdentity", {
                  key: defaultValues.key,
                  channel: t(`channels.${defaultValues.channel}`),
                  locale: t(`notifications.locales.${defaultValues.locale}`),
                })}
              </p>
            )}
            {channel === "email" ? (
              <TextInputField<TemplateFormInput> name="subject" label={t("notifications.fields.subject")} />
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="f-body">{t("notifications.fields.body")}</Label>
              <Textarea
                id="f-body"
                rows={12}
                lang={locale}
                aria-invalid={!!bodyError}
                className="font-mono text-sm"
                {...form.register("body")}
              />
              {bodyError ? (
                <p className="text-sm text-destructive">{t("notifications.bodyRequired")}</p>
              ) : null}
              {channel !== "email" ? (
                <p className="text-xs text-muted-foreground">
                  {t("notifications.length", { count: body.length })}
                </p>
              ) : null}
            </div>
            <SwitchField<TemplateFormInput> name="is_active" label={t("notifications.fields.active")} />
          </FormSection>

          <FormSection title={t("notifications.placeholders")}>
            <p className="text-sm text-muted-foreground">{t("notifications.placeholdersHelp")}</p>
            <div className="flex flex-wrap gap-1.5">
              {BOOKING_PLACEHOLDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => insert(p)}
                  className="inline-flex min-h-10 items-center rounded-lg border bg-background px-2.5 font-mono text-xs hover:bg-accent"
                >
                  {`{{${p}}}`}
                </button>
              ))}
            </div>
            {unknown.length ? (
              <p className="text-sm text-accent-amber">
                {t("notifications.unknownPlaceholders", { names: unknown.join(", ") })}
              </p>
            ) : null}
          </FormSection>
        </div>

        <FormSection title={t("notifications.preview")} className="content-start lg:sticky lg:top-20">
          <p className="text-xs text-muted-foreground">{t("notifications.previewLead")}</p>
          <div className="space-y-2 rounded-xl border bg-background p-3" lang={locale}>
            {channel === "email" ? <p className="font-semibold">{renderTemplate(subject, samples)}</p> : null}
            <p className="text-sm break-words whitespace-pre-wrap">{renderTemplate(body, samples)}</p>
          </div>
        </FormSection>

        <div className="lg:col-span-2">
          <SubmitBar pending={pending} isNew={isNew} />
        </div>
      </form>
    </FormProvider>
  );
}
