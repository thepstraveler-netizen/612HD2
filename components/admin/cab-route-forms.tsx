"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FormProvider, useFieldArray, useForm, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { saveRoute, saveRouteFares } from "@/lib/cabs/admin-actions";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import {
  ROUTE_TRIP_TYPES,
  routeFaresFormSchema,
  routeFormSchema,
  type RouteFaresFormInput,
  type RouteFormInput,
} from "@/schemas/cab-admin";
import { FareTable, MoneyCell } from "./cab-catalog-forms";
import { FormIssue, useCabSave } from "./cab-shared";
import {
  PageSaveRow,
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import { FormSection, SubmitBar, useLocalizedOptions } from "./hotel-shared";

type Option = { value: string; label: LocalizedJson };

function Stops() {
  const t = useTranslations("cabsAdmin.routes");
  const { control } = useFormContext<RouteFormInput>();
  const stops = useFieldArray({ control, name: "stops", keyName: "key" });
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{t("stops")}</legend>
      <p className="text-xs text-muted-foreground">{t("stopsHelp")}</p>
      {stops.fields.map((field, index) => (
        <div key={field.key} className="flex items-end gap-1">
          <TextInputField<RouteFormInput>
            name={`stops.${index}.name`}
            label={t("stopN", { n: index + 1 })}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("moveUp")}
            disabled={index === 0}
            onClick={() => stops.move(index, index - 1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("moveDown")}
            disabled={index === stops.fields.length - 1}
            onClick={() => stops.move(index, index + 1)}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("removeStop")}
            onClick={() => stops.remove(index)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {stops.fields.length < 30 ? (
        <Button type="button" variant="outline" className="w-fit" onClick={() => stops.append({ name: "" })}>
          <Plus /> {t("addStop")}
        </Button>
      ) : null}
    </fieldset>
  );
}

export function RouteForm({
  defaultValues,
  places,
  editHref,
  deleteButton,
}: {
  defaultValues: RouteFormInput;
  places: Option[];
  /** The new route opens at `${editHref}/<id>` to add its fares. */
  editHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("cabsAdmin");
  const form = useForm<RouteFormInput>({
    resolver: zodResolver(routeFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useCabSave(form, saveRoute, {
    isNew,
    afterCreate: (id) => (id ? `${editHref}/${id}` : editHref),
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  const placeOptions = useLocalizedOptions(places);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("routes.sections.route")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField<RouteFormInput>
              name="trip_type"
              label={t("fields.tripType")}
              options={ROUTE_TRIP_TYPES.map((v) => ({ value: v, label: t(`tripTypes.${v}`) }))}
            />
            <TextInputField<RouteFormInput>
              name="slug"
              label={t("fields.slug")}
              placeholder="mathura-to-delhi-airport"
              help={t("fields.slugHelp")}
            />
            <SelectField<RouteFormInput>
              name="from_place_id"
              label={t("routes.from")}
              options={placeOptions}
            />
            <SelectField<RouteFormInput> name="to_place_id" label={t("routes.to")} options={placeOptions} />
            <TextInputField<RouteFormInput>
              name="distance_km"
              label={t("routes.distance")}
              placeholder="160"
            />
            <TextInputField<RouteFormInput>
              name="duration_minutes"
              label={t("routes.duration")}
              type="number"
              help={t("routes.durationHelp")}
            />
          </div>
          <LocalizedField<RouteFormInput> name="name" label={t("routes.name")} />
          <p className="-mt-2 text-xs text-muted-foreground">{t("routes.nameHelp")}</p>
          <LocalizedField<RouteFormInput> name="description" label={t("fields.description")} multiline />
          <Stops />
          <div className="flex flex-wrap items-end gap-6">
            <TextInputField<RouteFormInput>
              name="sort_order"
              label={t("fields.sortOrder")}
              type="number"
              className="w-28"
            />
            <SwitchField<RouteFormInput> name="is_popular" label={t("fields.popular")} />
            <SwitchField<RouteFormInput> name="is_active" label={t("fields.active")} />
          </div>
        </FormSection>
        <FormIssue />
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

/** Fixed fares of one route per category; leaving a fare empty stops offering that category. */
export function RouteFaresForm({
  defaultValues,
  categories,
}: {
  defaultValues: RouteFaresFormInput;
  categories: Option[];
}) {
  const t = useTranslations("cabsAdmin");
  const tc = useTranslations("cms.actions");
  const locale = useLocale();
  const form = useForm<RouteFaresFormInput>({
    resolver: zodResolver(routeFaresFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useCabSave(form, saveRouteFares, { isNew: false });
  const categoryName = new Map(categories.map((c) => [c.value, pickLocalized(c.label, locale)]));
  const { register } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" noValidate>
        <FormSection title={t("routes.sections.fares")}>
          <p className="text-sm text-muted-foreground">{t("routes.faresLead")}</p>
          <FareTable
            headers={[t("fares.category"), t("routes.fare"), t("fares.extraKm"), t("fares.tolls")]}
            rows={defaultValues.fares.map((f, index) => ({
              key: f.category_id,
              label: categoryName.get(f.category_id) ?? "",
              cells: [
                <MoneyCell key="fare" name={`fares.${index}.fare`} label={t("routes.fare")} />,
                <MoneyCell key="extra" name={`fares.${index}.extra_km`} label={t("fares.extraKm")} />,
                <input
                  key="tolls"
                  type="checkbox"
                  aria-label={t("fares.tolls")}
                  className="size-5 accent-primary"
                  {...register(`fares.${index}.tolls_included`)}
                />,
              ],
            }))}
          />
          <PageSaveRow>
            <Button type="submit" disabled={pending}>
              {tc("save")}
            </Button>
          </PageSaveRow>
        </FormSection>
      </form>
    </FormProvider>
  );
}
