"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Plus, Save, Send, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { FormProvider, useFieldArray, useForm, useWatch, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { saveQuote, sendQuote, type LeadActionResult } from "@/lib/leads/crm-actions";
import { payNowAmount } from "@/lib/leads/quote";
import { newQuoteLine, quotePreview } from "@/lib/leads/ui";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { quoteFormSchema, type LeadsSettings, type QuoteFormInput } from "@/schemas/leads";
import { TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { FormSection } from "./hotel-shared";
import { TextareaField, useLeadsErrorText } from "./lead-shared";

export type SentQuote = Extract<LeadActionResult, { ok: true }>;

const MAX_LINES = 30;

/**
 * Live totals for the lines typed so far, priced with the same pure code
 * the server uses (lib/leads/quote.ts). Only a preview: saving re-prices
 * on the server.
 */
function QuoteTotals() {
  const t = useTranslations("leadsAdmin.builder");
  const locale = useLocale();
  const lines = useWatch<QuoteFormInput, "lines">({ name: "lines" });
  const payNow = useWatch<QuoteFormInput, "payNow">({ name: "payNow" });
  const advance = useWatch<QuoteFormInput, "advance">({ name: "advance" });
  const price = quotePreview(lines ?? []);
  const advancePaise = rupeesToPaise(String(advance ?? "").trim()) ?? "";
  const due = payNowAmount(price.totalPaise, payNow === "advance" ? "advance" : "full", advancePaise);
  const money = (paise: number) => formatPaise(paise, locale);
  return (
    <dl
      className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-muted/50 p-3 text-sm"
      aria-live="polite"
    >
      <dt className="text-muted-foreground">{t("subtotal")}</dt>
      <dd className="text-right">{money(price.subtotalPaise)}</dd>
      <dt className="text-muted-foreground">{t("gst")}</dt>
      <dd className="text-right">{money(price.taxPaise)}</dd>
      <dt className="font-semibold">{t("total")}</dt>
      <dd className="text-right font-semibold">{money(price.totalPaise)}</dd>
      <dt className="text-muted-foreground">{t("payNowAmount")}</dt>
      <dd className={cn("text-right", !due.ok && price.totalPaise > 0 && "text-accent-amber")}>
        {due.ok ? money(due.paise) : "–"}
      </dd>
      {!due.ok && price.totalPaise > 0 ? (
        <dd className="col-span-2 text-xs text-accent-amber">
          {t(due.error === "advance_required" ? "advanceMissing" : "advanceHigh")}
        </dd>
      ) : null}
      {price.incomplete ? <dd className="col-span-2 text-xs text-accent-amber">{t("incomplete")}</dd> : null}
      <dd className="col-span-2 text-xs text-muted-foreground">{t("previewHelp")}</dd>
    </dl>
  );
}

/**
 * Builds or edits a draft quote: lines (description, quantity, unit price
 * in ₹ before GST, GST %, SAC — defaults from leads.defaults), pay now in
 * full or an advance, validity in hours, notes and terms. "Send" saves the
 * draft and sends it (unpaid booking, payment link, message to the
 * customer).
 */
export function QuoteBuilder({
  defaultValues,
  settings,
  onClose,
  onSent,
}: {
  defaultValues: QuoteFormInput;
  settings: Pick<LeadsSettings, "quote_tax_bps" | "quote_sac">;
  onClose: () => void;
  onSent: (result: SentQuote) => void;
}) {
  const t = useTranslations("leadsAdmin.builder");
  const tq = useTranslations("leadsAdmin.quotes");
  const tErr = useTranslations("leadsAdmin.errors");
  const errorText = useLeadsErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<QuoteFormInput>({
    resolver: zodResolver(quoteFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const lines = useFieldArray({ control: form.control, name: "lines", keyName: "key" });
  const payNow = useWatch({ control: form.control, name: "payNow" });
  useUnsavedChangesWarning(form.formState.isDirty);

  /** Saves the draft; then sends it when asked. */
  const submit = (send: boolean) =>
    form.handleSubmit(
      (values) => {
        if (send && !window.confirm(tq("confirmSend"))) return;
        startTransition(async () => {
          const saved = await saveQuote(values);
          if (!saved.ok) {
            if (saved.field)
              form.setError(saved.field as Path<QuoteFormInput>, { message: errorText(saved.error) });
            toast.error(errorText(saved.error));
            return;
          }
          form.reset(values);
          if (!send) {
            toast.success(t("saved"));
            router.refresh();
            onClose();
            return;
          }
          const sent = await sendQuote({ quoteId: saved.id ?? values.quoteId });
          if (!sent.ok) {
            // The draft is saved; it stays in the list to send again.
            toast.error(errorText(sent.error));
            router.refresh();
            onClose();
            return;
          }
          toast.success(tq("sent"));
          onSent(sent);
          router.refresh();
          onClose();
        });
      },
      () => toast.error(tErr("invalid")),
    );

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={submit(false)}>
        <FormSection title={defaultValues.quoteId ? t("editTitle") : t("title")}>
          <TextInputField<QuoteFormInput>
            name="title"
            label={t("quoteTitle")}
            placeholder={t("titlePlaceholder")}
          />

          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">{t("lines")}</legend>
            {lines.fields.map((field, index) => (
              <div
                key={field.key}
                className="grid items-end gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,3fr)_4.5rem_minmax(0,1.3fr)_4.5rem_6rem_auto]"
              >
                <TextInputField<QuoteFormInput>
                  name={`lines.${index}.description`}
                  label={t("description")}
                  placeholder={t("descriptionPlaceholder")}
                />
                <TextInputField<QuoteFormInput>
                  name={`lines.${index}.quantity`}
                  label={t("qty")}
                  type="number"
                />
                <TextInputField<QuoteFormInput> name={`lines.${index}.unitPrice`} label={t("unitPrice")} />
                <TextInputField<QuoteFormInput> name={`lines.${index}.taxPercent`} label={t("gstPercent")} />
                <TextInputField<QuoteFormInput> name={`lines.${index}.sac`} label={t("sac")} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("removeLine")}
                  disabled={lines.fields.length <= 1}
                  onClick={() => lines.remove(index)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {lines.fields.length < MAX_LINES ? (
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => lines.append(newQuoteLine(settings))}
              >
                <Plus /> {t("addLine")}
              </Button>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("payNow")}</legend>
              <div className="flex flex-wrap gap-2">
                {(["full", "advance"] as const).map((mode) => (
                  <label
                    key={mode}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50",
                      payNow === mode
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card hover:bg-accent",
                    )}
                  >
                    <input type="radio" value={mode} className="sr-only" {...form.register("payNow")} />
                    {t(mode)}
                  </label>
                ))}
              </div>
              {payNow === "advance" ? (
                <TextInputField<QuoteFormInput>
                  name="advance"
                  label={t("advanceAmount")}
                  help={t("rupees")}
                />
              ) : null}
            </fieldset>
            <TextInputField<QuoteFormInput>
              name="validHours"
              label={t("validHours")}
              type="number"
              help={t("validHelp")}
            />
          </div>

          <TextareaField<QuoteFormInput>
            name="notes"
            label={t("notes")}
            placeholder={t("notesPlaceholder")}
          />
          <TextareaField<QuoteFormInput>
            name="terms"
            label={t("terms")}
            placeholder={t("termsPlaceholder")}
            rows={4}
          />

          <QuoteTotals />

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              <X /> {t("cancel")}
            </Button>
            <Button type="submit" variant="outline" disabled={pending}>
              <Save /> {t("saveDraft")}
            </Button>
            <Button type="button" disabled={pending} onClick={() => void submit(true)()}>
              <Send /> {t("saveAndSend")}
            </Button>
          </div>
        </FormSection>
      </form>
    </FormProvider>
  );
}
