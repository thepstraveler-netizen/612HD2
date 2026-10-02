"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Send, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { sendMedicineQuote } from "@/lib/delivery/admin-actions";
import { NEW_QUOTE_LINE, quoteFormLines } from "@/lib/delivery/admin-rows";
import { buildQuoteLines } from "@/lib/delivery/cart";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import { finalizePrice } from "@/lib/pricing/booking";
import type { DeliverySettings } from "@/schemas/delivery";
import { quoteFormSchema, quoteLineFormSchema, type QuoteFormInput } from "@/schemas/delivery-admin";
import { useDeliverySave } from "./delivery-shared";
import { SelectField, TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { FormSection } from "./hotel-shared";

type Option = { value: string; label: string };

/** Running total of the lines typed so far (invalid lines are left out). */
function QuoteTotal({ settings }: { settings: DeliverySettings }) {
  const t = useTranslations("deliveryAdmin.quote");
  const locale = useLocale();
  const lines = useWatch<QuoteFormInput, "lines">({ name: "lines" });
  const fee = useWatch<QuoteFormInput, "delivery_fee">({ name: "delivery_fee" });
  const valid = (lines ?? []).flatMap((l) => {
    const parsed = quoteLineFormSchema.safeParse(l);
    return parsed.success ? [parsed.data] : [];
  });
  const feePaise = rupeesToPaise(String(fee ?? "").trim() || "0") ?? 0;
  const price = valid.length
    ? finalizePrice(buildQuoteLines(quoteFormLines({ lines: valid }), feePaise, settings, null), 0, [])
    : null;
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-muted/50 p-3 text-sm">
      <dt className="text-muted-foreground">{t("subtotal")}</dt>
      <dd className="text-right">{formatPaise(price?.subtotalPaise ?? 0, locale)}</dd>
      <dt className="text-muted-foreground">{t("gst")}</dt>
      <dd className="text-right">{formatPaise(price?.taxPaise ?? 0, locale)}</dd>
      <dt className="font-semibold">{t("total")}</dt>
      <dd className="text-right font-semibold">{formatPaise(price?.totalPaise ?? 0, locale)}</dd>
      {valid.length < (lines ?? []).length ? (
        <dd className="col-span-2 text-xs text-accent-amber">{t("incomplete")}</dd>
      ) : null}
      <dd className="col-span-2 text-xs text-muted-foreground">{t("totalHelp")}</dd>
    </dl>
  );
}

/**
 * Builds and sends a quote for a prescription: medicine lines (name, pack,
 * quantity, unit price, GST, HSN), delivery fee and a note. Sending
 * replaces the live quote and tells the customer; the quote stays valid for
 * the configured hours.
 */
export function MedicineQuoteBuilder({
  defaultValues,
  pharmacies,
  settings,
}: {
  defaultValues: QuoteFormInput;
  pharmacies: Option[];
  settings: DeliverySettings;
}) {
  const t = useTranslations("deliveryAdmin.quote");
  const form = useForm<QuoteFormInput>({
    resolver: zodResolver(quoteFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const lines = useFieldArray({ control: form.control, name: "lines", keyName: "key" });
  const { pending, onSubmit } = useDeliverySave(form, sendMedicineQuote, { isNew: false });
  useUnsavedChangesWarning(form.formState.isDirty);

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          if (!window.confirm(t("confirmSend"))) {
            e.preventDefault();
            return;
          }
          void onSubmit(e);
        }}
        noValidate
      >
        <FormSection title={t("title")}>
          <p className="text-sm text-muted-foreground">{t("lead", { hours: settings.quote_valid_hours })}</p>
          <SelectField<QuoteFormInput>
            name="store_id"
            label={t("pharmacy")}
            options={[{ value: "", label: t("pickPharmacy") }, ...pharmacies]}
          />
          {lines.fields.map((field, index) => (
            <div
              key={field.key}
              className="grid items-end gap-2 rounded-xl border p-3 sm:grid-cols-[2fr_1fr_4rem_6rem_5rem_6rem_auto]"
            >
              <TextInputField<QuoteFormInput>
                name={`lines.${index}.name`}
                label={t("medicine")}
                placeholder="Dolo 650"
              />
              <TextInputField<QuoteFormInput>
                name={`lines.${index}.pack`}
                label={t("pack")}
                placeholder="15 tablets"
              />
              <TextInputField<QuoteFormInput> name={`lines.${index}.qty`} label={t("qty")} type="number" />
              <TextInputField<QuoteFormInput> name={`lines.${index}.unit_price`} label={t("unitPrice")} />
              <TextInputField<QuoteFormInput> name={`lines.${index}.gst_percent`} label={t("gstPercent")} />
              <TextInputField<QuoteFormInput>
                name={`lines.${index}.hsn`}
                label={t("hsn")}
                placeholder="3004"
              />
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
          {lines.fields.length < 50 ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => lines.append({ ...NEW_QUOTE_LINE })}
            >
              <Plus /> {t("addLine")}
            </Button>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<QuoteFormInput> name="delivery_fee" label={t("deliveryFee")} help={t("rupees")} />
            <TextInputField<QuoteFormInput> name="note" label={t("note")} />
          </div>
          <QuoteTotal settings={settings} />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              <Send /> {t("send")}
            </Button>
          </div>
        </FormSection>
      </form>
    </FormProvider>
  );
}
