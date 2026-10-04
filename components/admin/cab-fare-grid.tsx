"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useLocale, useTranslations } from "next-intl";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { saveFareRules } from "@/lib/cabs/admin-actions";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { FARE_RULE_TRIP_TYPES, fareRulesFormSchema, type FareRulesFormInput } from "@/schemas/cab-admin";
import { FareTable, GridInput, MoneyCell } from "./cab-catalog-forms";
import { useCabSave } from "./cab-shared";
import { PageSaveRow, useUnsavedChangesWarning } from "./form-fields";
import { FormSection } from "./hotel-shared";

function CheckCell({ name, label }: { name: string; label: string }) {
  const { register } = useFormContext<Record<string, unknown>>();
  return <input type="checkbox" aria-label={label} className="size-5 accent-primary" {...register(name)} />;
}

/**
 * Per-km outstation fares: every category × (one way, round trip) in one
 * form. Money is in rupees; an empty rate per km means the category is not
 * offered for that trip type (the rule is removed on save).
 */
export function FareGrid({
  defaultValues,
  categories,
}: {
  defaultValues: FareRulesFormInput;
  categories: { value: string; label: LocalizedJson }[];
}) {
  const t = useTranslations("cabsAdmin");
  const tc = useTranslations("cms.actions");
  const locale = useLocale();
  const form = useForm<FareRulesFormInput>({
    resolver: zodResolver(fareRulesFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useCabSave(form, saveFareRules, { isNew: false });
  useUnsavedChangesWarning(form.formState.isDirty);
  const categoryName = new Map(categories.map((c) => [c.value, pickLocalized(c.label, locale)]));
  const rules = defaultValues.rules.map((r, index) => ({ ...r, index }));

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {FARE_RULE_TRIP_TYPES.map((tripType) => {
          const minKey = tripType === "one_way" ? "min_km" : "min_km_per_day";
          const minLabel = tripType === "one_way" ? t("fares.minKm") : t("fares.minKmPerDay");
          return (
            <FormSection key={tripType} title={t(`tripTypes.${tripType}`)}>
              <p className="text-sm text-muted-foreground">{t(`fares.formula.${tripType}`)}</p>
              <FareTable
                headers={[
                  t("fares.category"),
                  t("fares.ratePerKm"),
                  minLabel,
                  t("fares.extraKm"),
                  t("fares.allowance"),
                  t("fares.nightCharge"),
                  t("fares.waitingFree"),
                  t("fares.waitingPerHour"),
                  t("fares.tolls"),
                  t("fields.active"),
                ]}
                rows={rules
                  .filter((r) => r.trip_type === tripType)
                  .map((r) => {
                    const p = `rules.${r.index}`;
                    return {
                      key: r.category_id,
                      label: categoryName.get(r.category_id) ?? "",
                      cells: [
                        <MoneyCell key="rate" name={`${p}.rate_per_km`} label={t("fares.ratePerKm")} />,
                        <GridInput key="min" name={`${p}.${minKey}`} label={minLabel} />,
                        <MoneyCell key="extra" name={`${p}.extra_km`} label={t("fares.extraKm")} />,
                        <MoneyCell key="da" name={`${p}.driver_allowance`} label={t("fares.allowance")} />,
                        <MoneyCell key="night" name={`${p}.night_charge`} label={t("fares.nightCharge")} />,
                        <GridInput
                          key="wf"
                          name={`${p}.waiting_free_minutes`}
                          label={t("fares.waitingFree")}
                        />,
                        <MoneyCell
                          key="wh"
                          name={`${p}.waiting_per_hour`}
                          label={t("fares.waitingPerHour")}
                        />,
                        <CheckCell key="tolls" name={`${p}.tolls_included`} label={t("fares.tolls")} />,
                        <CheckCell key="active" name={`${p}.is_active`} label={t("fields.active")} />,
                      ],
                    };
                  })}
              />
            </FormSection>
          );
        })}
        <p className="text-sm text-muted-foreground">{t("fares.emptyHelp")}</p>
        <PageSaveRow>
          <Button type="submit" disabled={pending}>
            {tc("save")}
          </Button>
        </PageSaveRow>
      </form>
    </FormProvider>
  );
}
