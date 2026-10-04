"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { useLocale, useTranslations } from "next-intl";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { saveRideFares } from "@/lib/rides/admin-actions";
import { RIDE_MODES, rideFaresFormSchema, type RideFaresFormInput } from "@/schemas/ride-admin";
import { FareTable, GridInput, MoneyCell } from "./cab-catalog-forms";
import { PageSaveRow, useUnsavedChangesWarning } from "./form-fields";
import { FormSection } from "./hotel-shared";
import { useRideSave } from "./ride-shared";

function CheckCell({ name, label }: { name: string; label: string }) {
  const { register } = useFormContext<Record<string, unknown>>();
  return <input type="checkbox" aria-label={label} className="size-5 accent-primary" {...register(name)} />;
}

/**
 * One zone's fares: every vehicle type × (point to point, hourly) in one
 * form. Money is in rupees, the night surcharge in %. A row left without
 * its main amount (base / per km / minimum, or the hourly rate) is not
 * offered and its rule is removed on save.
 */
export function RideFareGrid({
  defaultValues,
  types,
}: {
  defaultValues: RideFaresFormInput;
  types: { value: string; label: LocalizedJson }[];
}) {
  const t = useTranslations("admin.rides");
  const tc = useTranslations("cms.actions");
  const locale = useLocale();
  const form = useForm<RideFaresFormInput>({
    resolver: zodResolver(rideFaresFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useRideSave(form, saveRideFares, { isNew: false });
  useUnsavedChangesWarning(form.formState.isDirty);
  const typeName = new Map(types.map((v) => [v.value, pickLocalized(v.label, locale)]));
  const rules = defaultValues.rules.map((r, index) => ({ ...r, index }));
  const f = (key: string) => t(`fares.${key}`);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {RIDE_MODES.map((mode) => {
          const hourly = mode === "hourly";
          const headers = hourly
            ? [
                f("vehicleType"),
                f("hourly"),
                f("minHours"),
                f("kmPerHour"),
                f("extraKm"),
                f("freeWaiting"),
                f("waitingPerMin"),
                f("night"),
                t("fields.active"),
              ]
            : [
                f("vehicleType"),
                f("base"),
                f("includedKm"),
                f("perKm"),
                f("minFare"),
                f("freeWaiting"),
                f("waitingPerMin"),
                f("night"),
                t("fields.active"),
              ];
          return (
            <FormSection key={mode} title={t(`modes.${mode}`)}>
              <p className="text-sm text-muted-foreground">{f(`formula.${mode}`)}</p>
              <FareTable
                headers={headers}
                rows={rules
                  .filter((r) => r.mode === mode)
                  .map((r) => {
                    const p = `rules.${r.index}`;
                    const shared = [
                      <GridInput key="fw" name={`${p}.free_waiting_minutes`} label={f("freeWaiting")} />,
                      <MoneyCell key="wm" name={`${p}.per_min_waiting`} label={f("waitingPerMin")} />,
                      <GridInput
                        key="night"
                        name={`${p}.night_percent`}
                        label={f("night")}
                        placeholder="%"
                        inputMode="decimal"
                      />,
                      <CheckCell key="active" name={`${p}.is_active`} label={t("fields.active")} />,
                    ];
                    return {
                      key: `${r.vehicle_type_id}-${mode}`,
                      label: typeName.get(r.vehicle_type_id) ?? "",
                      cells: hourly
                        ? [
                            <MoneyCell key="h" name={`${p}.hourly`} label={f("hourly")} />,
                            <GridInput key="mh" name={`${p}.min_hours`} label={f("minHours")} />,
                            <GridInput key="kph" name={`${p}.km_per_hour`} label={f("kmPerHour")} />,
                            <MoneyCell key="pk" name={`${p}.per_km`} label={f("extraKm")} />,
                            ...shared,
                          ]
                        : [
                            <MoneyCell key="b" name={`${p}.base`} label={f("base")} />,
                            <GridInput
                              key="ik"
                              name={`${p}.included_km`}
                              label={f("includedKm")}
                              inputMode="decimal"
                            />,
                            <MoneyCell key="pk" name={`${p}.per_km`} label={f("perKm")} />,
                            <MoneyCell key="mf" name={`${p}.min_fare`} label={f("minFare")} />,
                            ...shared,
                          ],
                    };
                  })}
              />
            </FormSection>
          );
        })}
        <p className="text-sm text-muted-foreground">{f("emptyHelp")}</p>
        <PageSaveRow>
          <Button type="submit" disabled={pending}>
            {tc("save")}
          </Button>
        </PageSaveRow>
      </form>
    </FormProvider>
  );
}
