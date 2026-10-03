"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Plus, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useForm, type UseFormReturn } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { planOptionLabel } from "@/lib/catalog/b2b-ui";
import { deleteServicePlan, saveServicePlan } from "@/lib/cms/service-b2b-actions";
import {
  MAX_PLAN_FEATURES,
  newServicePlanValues,
  servicePlanFormSchema,
  servicePlanFormValues,
  type ServicePlanFormInput,
} from "@/schemas/service-b2b";
import type { Tables } from "@/types/database";
import { FormSection } from "./hotel-shared";
import { MiniField, MiniSwitch, PackageDeleteButton, usePackageSave } from "./package-shared";

/**
 * CMS → Services → edit: the plans shown as pricing cards on the public
 * service page. Each plan saves on its own (cms.write, audited); an empty
 * price shows "Price on request". Features are one per line, English and
 * Hindi lines side by side.
 */

function FeaturesField({
  form,
  name,
  label,
  idPrefix,
  lang,
}: {
  form: UseFormReturn<ServicePlanFormInput>;
  name: "features_en" | "features_hi";
  label: string;
  idPrefix: string;
  lang: "en" | "hi";
}) {
  const te = useTranslations("cms.errors");
  const id = `${idPrefix}-${name}`;
  const code = form.formState.errors[name]?.message;
  const message = code ? (te.has(code) ? te(code) : code) : undefined;
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Textarea
        id={id}
        rows={5}
        lang={lang}
        aria-invalid={!!message}
        aria-describedby={message ? `${id}-error` : undefined}
        {...form.register(name)}
      />
      {message ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function PlanFields({ values, isNew }: { values: ServicePlanFormInput; isNew?: boolean }) {
  const t = useTranslations("cms.plans");
  const form = useForm<ServicePlanFormInput>({
    resolver: zodResolver(servicePlanFormSchema, undefined, { raw: true }),
    defaultValues: values,
  });
  const { pending, onSubmit } = usePackageSave(form, saveServicePlan, {
    isNew: false,
    onSaved: () => {
      if (isNew) form.reset(values);
    },
  });
  const prefix = `plan-${values.id ?? "new"}`;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <MiniField form={form} name="name.en" label={t("nameEn")} idPrefix={prefix} lang="en" />
        <MiniField form={form} name="name.hi" label={t("nameHi")} idPrefix={prefix} lang="hi" />
        <MiniField form={form} name="summary.en" label={t("summaryEn")} idPrefix={prefix} lang="en" />
        <MiniField form={form} name="summary.hi" label={t("summaryHi")} idPrefix={prefix} lang="hi" />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <MiniField
          form={form}
          name="price"
          label={t("price")}
          idPrefix={prefix}
          inputMode="decimal"
          placeholder={t("pricePlaceholder")}
        />
        <MiniField
          form={form}
          name="price_suffix.en"
          label={t("suffixEn")}
          idPrefix={prefix}
          lang="en"
          placeholder={t("suffixPlaceholder")}
        />
        <MiniField form={form} name="price_suffix.hi" label={t("suffixHi")} idPrefix={prefix} lang="hi" />
      </div>
      <p className="text-xs text-muted-foreground">{t("priceHelp")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <FeaturesField form={form} name="features_en" label={t("featuresEn")} idPrefix={prefix} lang="en" />
        <FeaturesField form={form} name="features_hi" label={t("featuresHi")} idPrefix={prefix} lang="hi" />
      </div>
      <p className="text-xs text-muted-foreground">{t("featuresHelp", { max: MAX_PLAN_FEATURES })}</p>
      <div className="grid items-end gap-2 sm:grid-cols-[7rem_1fr_1fr]">
        <MiniField
          form={form}
          name="sort_order"
          label={t("sortOrder")}
          idPrefix={prefix}
          type="number"
          inputMode="numeric"
        />
        <MiniSwitch form={form} name="is_popular" label={t("popular")} idPrefix={prefix} />
        <MiniSwitch form={form} name="is_published" label={t("published")} idPrefix={prefix} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {isNew ? <Plus /> : <Save />} {isNew ? t("add") : t("save")}
        </Button>
        {values.id ? (
          <PackageDeleteButton id={values.id} action={deleteServicePlan} confirmText={t("confirmDelete")} />
        ) : null}
      </div>
    </form>
  );
}

export function ServicePlansEditor({
  serviceId,
  plans,
}: {
  serviceId: string;
  plans: Tables<"service_plans">[];
}) {
  const t = useTranslations("cms.plans");
  const locale = useLocale();
  return (
    <FormSection title={t("title")}>
      <p className="text-sm text-muted-foreground">{t("lead")}</p>
      {plans.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : null}
      <ul className="grid gap-3">
        {plans.map((plan) => (
          <li key={`${plan.id}-${plan.updated_at}`}>
            <details className="group rounded-xl border">
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  className="size-4 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
                <span className="font-medium">
                  {planOptionLabel(
                    { name: plan.name, pricePaise: plan.price_paise, priceSuffix: plan.price_suffix },
                    locale,
                  )}
                </span>
                {plan.price_paise === null ? (
                  <span className="text-sm text-muted-foreground">{t("onRequest")}</span>
                ) : null}
                <span className="ms-auto flex flex-wrap gap-1.5">
                  {plan.is_popular ? <Badge>{t("popular")}</Badge> : null}
                  <Badge variant={plan.is_published ? "secondary" : "outline"}>
                    {plan.is_published ? t("published") : t("hidden")}
                  </Badge>
                  <Badge variant="outline">#{plan.sort_order}</Badge>
                </span>
              </summary>
              <div className="border-t p-3">
                <PlanFields values={servicePlanFormValues(plan)} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-dashed p-3">
        <h3 className="mb-3 text-sm font-semibold">{t("newTitle")}</h3>
        <PlanFields key={`new-${plans.length}`} values={newServicePlanValues(serviceId, plans)} isNew />
      </div>
    </FormSection>
  );
}
