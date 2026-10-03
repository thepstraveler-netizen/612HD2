"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { AlertTriangle, CheckCircle2, Plus, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminDeparture } from "@/lib/packages/admin";
import {
  deleteDeparture,
  deleteItineraryDay,
  deletePricingTier,
  saveDeparture,
  saveItineraryDay,
  savePricingTier,
} from "@/lib/packages/admin-actions";
import {
  departureFormValues,
  itineraryDayFormValues,
  itineraryGaps,
  newDepartureValues,
  newItineraryDayValues,
  newTierValues,
  TIER_PROBLEM_KEYS,
  tierFormValues,
} from "@/lib/packages/admin-rows";
import { checkTiers } from "@/lib/packages/pricing";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  departureFormSchema,
  itineraryDayFormSchema,
  MEALS,
  pricingTierFormSchema,
  type DepartureFormInput,
  type ItineraryDayFormInput,
  type PricingTierFormInput,
} from "@/schemas/package-admin";
import type { Tables } from "@/types/database";
import { FormSection } from "./hotel-shared";
import {
  MiniField,
  MiniSwitch,
  PackageDeleteButton,
  PackageFormIssue,
  usePackageSave,
} from "./package-shared";

/**
 * The editors below the package form: itinerary days, pricing tiers (with
 * a live check that they cover every group size) and departures (with
 * seats booked and left). Every row saves on its own; the server
 * re-validates and the site's catalog cache clears.
 */

type PackageLimits = Pick<
  Tables<"packages">,
  "id" | "min_pax" | "max_pax" | "duration_days" | "fixed_departures"
>;

function Callout({ tone, children }: { tone: "warning" | "success"; children: ReactNode }) {
  const Icon = tone === "warning" ? AlertTriangle : CheckCircle2;
  return (
    <p
      role={tone === "warning" ? "status" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-xl border p-3 text-sm",
        tone === "warning"
          ? "border-accent-amber/40 bg-accent-amber/10 text-accent-amber"
          : "border-accent-green/30 bg-accent-green/10 text-accent-green",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------- itinerary

function DayRow({ values, isNew }: { values: ItineraryDayFormInput; isNew?: boolean }) {
  const t = useTranslations("packagesAdmin");
  const form = useForm<ItineraryDayFormInput>({
    resolver: zodResolver(itineraryDayFormSchema, undefined, { raw: true }),
    defaultValues: values,
  });
  const { pending, onSubmit } = usePackageSave(form, saveItineraryDay, {
    isNew: false,
    onSaved: () => {
      if (isNew) form.reset(values);
    },
  });
  const prefix = `day-${values.id ?? "new"}`;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 rounded-xl border p-3">
      <div className="grid items-end gap-2 sm:grid-cols-[5rem_1fr_1fr]">
        <MiniField form={form} name="day_number" label={t("itinerary.day")} idPrefix={prefix} type="number" />
        <MiniField
          form={form}
          name="title.en"
          label={t("itinerary.titleEn")}
          idPrefix={prefix}
          placeholder={t("itinerary.titlePlaceholder")}
        />
        <MiniField form={form} name="title.hi" label={t("itinerary.titleHi")} idPrefix={prefix} lang="hi" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`${prefix}-desc-en`} className="text-xs text-muted-foreground">
            {t("itinerary.descriptionEn")}
          </Label>
          <Textarea id={`${prefix}-desc-en`} rows={3} lang="en" {...form.register("description.en")} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${prefix}-desc-hi`} className="text-xs text-muted-foreground">
            {t("itinerary.descriptionHi")}
          </Label>
          <Textarea id={`${prefix}-desc-hi`} rows={3} lang="hi" {...form.register("description.hi")} />
        </div>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr]">
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-xs text-muted-foreground">{t("itinerary.meals")}</legend>
          <div className="flex flex-wrap gap-x-4">
            {MEALS.map((meal) => (
              <label key={meal} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={meal}
                  className="size-5 accent-primary"
                  {...form.register("meals")}
                />
                {t(`meals.${meal}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <MiniField
          form={form}
          name="overnight"
          label={t("itinerary.overnight")}
          idPrefix={prefix}
          placeholder="Vrindavan"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {isNew ? <Plus /> : <Save />} {isNew ? t("itinerary.add") : t("actions.save")}
        </Button>
        {values.id ? (
          <PackageDeleteButton
            id={values.id}
            action={deleteItineraryDay}
            confirmText={t("itinerary.confirmDelete")}
          />
        ) : null}
      </div>
    </form>
  );
}

export function ItineraryEditor({
  pkg,
  days,
}: {
  pkg: PackageLimits;
  days: Tables<"package_itinerary_days">[];
}) {
  const t = useTranslations("packagesAdmin");
  const { missing, extra } = itineraryGaps(days, pkg.duration_days);
  return (
    <FormSection title={t("sections.itinerary")}>
      <p className="text-sm text-muted-foreground">{t("itinerary.lead")}</p>
      {missing.length ? (
        <Callout tone="warning">{t("itinerary.missing", { days: missing.join(", ") })}</Callout>
      ) : null}
      {extra.length ? (
        <Callout tone="warning">{t("itinerary.extra", { days: extra.join(", ") })}</Callout>
      ) : null}
      {days.map((d) => (
        <DayRow key={`${d.id}-${d.updated_at}`} values={itineraryDayFormValues(d)} />
      ))}
      {days.length < 60 ? (
        <DayRow key={`new-${days.length}`} values={newItineraryDayValues(pkg.id, days)} isNew />
      ) : null}
    </FormSection>
  );
}

// ---------------------------------------------------------------- pricing tiers

function TierRow({ values, isNew }: { values: PricingTierFormInput; isNew?: boolean }) {
  const t = useTranslations("packagesAdmin");
  const form = useForm<PricingTierFormInput>({
    resolver: zodResolver(pricingTierFormSchema, undefined, { raw: true }),
    defaultValues: values,
  });
  const { pending, onSubmit } = usePackageSave(form, savePricingTier, {
    isNew: false,
    onSaved: () => {
      if (isNew) form.reset(values);
    },
  });
  const prefix = `tier-${values.id ?? "new"}`;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-2 rounded-xl border p-3">
      <div className="grid items-end gap-2 sm:grid-cols-[6rem_6rem_1fr_1fr_auto]">
        <MiniField
          form={form}
          name="min_pax"
          label={t("tiers.minPax")}
          idPrefix={prefix}
          type="number"
          inputMode="numeric"
        />
        <MiniField
          form={form}
          name="max_pax"
          label={t("tiers.maxPax")}
          idPrefix={prefix}
          type="number"
          inputMode="numeric"
        />
        <MiniField
          form={form}
          name="adult_price"
          label={t("tiers.adultPrice")}
          idPrefix={prefix}
          inputMode="decimal"
          placeholder="4499"
        />
        <MiniField
          form={form}
          name="child_price"
          label={t("tiers.childPrice")}
          idPrefix={prefix}
          inputMode="decimal"
          placeholder={t("tiers.childPlaceholder")}
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {isNew ? <Plus /> : <Save />} {isNew ? t("tiers.add") : t("actions.save")}
          </Button>
          {values.id ? (
            <PackageDeleteButton
              id={values.id}
              action={deletePricingTier}
              inUseText={t("tiers.lastTierInUse")}
            />
          ) : null}
        </div>
      </div>
      <PackageFormIssue form={form} />
    </form>
  );
}

export function TiersEditor({
  pkg,
  tiers,
}: {
  pkg: PackageLimits;
  tiers: Tables<"package_pricing_tiers">[];
}) {
  const t = useTranslations("packagesAdmin");
  const te = useTranslations("packagesAdmin.errors");
  const locale = useLocale();
  const problem = checkTiers(
    tiers.map((x) => ({ minPax: x.min_pax, maxPax: x.max_pax })),
    pkg.min_pax,
    pkg.max_pax,
  );
  const from = tiers.length ? Math.min(...tiers.map((x) => x.adult_price_paise)) : null;
  return (
    <FormSection title={t("sections.pricing")}>
      <p className="text-sm text-muted-foreground">
        {t("tiers.lead", { min: pkg.min_pax, max: pkg.max_pax })}
      </p>
      <div aria-live="polite">
        {problem ? (
          <Callout tone="warning">{te(TIER_PROBLEM_KEYS[problem])}</Callout>
        ) : (
          <Callout tone="success">
            {t("tiers.covered", {
              min: pkg.min_pax,
              max: pkg.max_pax,
              from: from === null ? "–" : formatPaise(from, locale),
            })}
          </Callout>
        )}
      </div>
      {tiers.map((tier) => (
        <TierRow key={`${tier.id}-${tier.updated_at}`} values={tierFormValues(tier)} />
      ))}
      <TierRow key={`new-${tiers.length}`} values={newTierValues(pkg.id, tiers, pkg)} isNew />
      <p className="text-xs text-muted-foreground">{t("tiers.help")}</p>
    </FormSection>
  );
}

// ---------------------------------------------------------------- departures

function SeatsBadge({ departure }: { departure: AdminDeparture }) {
  const t = useTranslations("packagesAdmin.departures");
  if (departure.seats_total === null) {
    return <Badge variant="secondary">{t("bookedUnlimited", { booked: departure.booked })}</Badge>;
  }
  const soldOut = departure.left === 0;
  return (
    <Badge variant={soldOut ? "destructive" : "secondary"}>
      {t("seats", { booked: departure.booked, left: departure.left ?? 0, total: departure.seats_total })}
    </Badge>
  );
}

function DepartureRow({
  values,
  departure,
  today,
  isNew,
}: {
  values: DepartureFormInput;
  departure?: AdminDeparture;
  today: string;
  isNew?: boolean;
}) {
  const t = useTranslations("packagesAdmin");
  const form = useForm<DepartureFormInput>({
    resolver: zodResolver(departureFormSchema, undefined, { raw: true }),
    defaultValues: values,
  });
  const { pending, onSubmit } = usePackageSave(form, saveDeparture, {
    isNew: false,
    onSaved: () => {
      if (isNew) form.reset(values);
    },
  });
  const prefix = `dep-${values.id ?? "new"}`;
  const past = departure ? departure.start_date < today : false;
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn("grid gap-2 rounded-xl border p-3", past && "bg-muted/40")}
    >
      {departure ? (
        <div className="flex flex-wrap items-center gap-2">
          <SeatsBadge departure={departure} />
          {past ? <Badge variant="outline">{t("departures.past")}</Badge> : null}
          {!departure.is_active ? <Badge variant="outline">{t("departures.off")}</Badge> : null}
        </div>
      ) : null}
      <div className="grid items-end gap-2 sm:grid-cols-[10rem_7rem_8rem_1fr_1fr]">
        <MiniField form={form} name="start_date" label={t("departures.date")} idPrefix={prefix} type="date" />
        <MiniField
          form={form}
          name="seats_total"
          label={t("departures.seatsTotal")}
          idPrefix={prefix}
          inputMode="numeric"
          placeholder={t("departures.noLimit")}
        />
        <MiniField
          form={form}
          name="supplement"
          label={t("departures.supplement")}
          idPrefix={prefix}
          inputMode="decimal"
        />
        <MiniField
          form={form}
          name="note.en"
          label={t("departures.noteEn")}
          idPrefix={prefix}
          placeholder={t("departures.notePlaceholder")}
        />
        <MiniField form={form} name="note.hi" label={t("departures.noteHi")} idPrefix={prefix} lang="hi" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <MiniSwitch form={form} name="is_active" label={t("departures.active")} idPrefix={prefix} />
        <Button type="submit" size="sm" disabled={pending}>
          {isNew ? <Plus /> : <Save />} {isNew ? t("departures.add") : t("actions.save")}
        </Button>
        {values.id ? (
          <PackageDeleteButton
            id={values.id}
            action={deleteDeparture}
            confirmText={t("departures.confirmDelete")}
            inUseText={t("departures.bookedInUse")}
          />
        ) : null}
      </div>
    </form>
  );
}

export function DeparturesEditor({
  pkg,
  departures,
  today,
}: {
  pkg: PackageLimits;
  departures: AdminDeparture[];
  today: string;
}) {
  const t = useTranslations("packagesAdmin");
  const upcoming = departures.filter((d) => d.is_active && d.start_date >= today);
  const lastSeats = departures.at(-1)?.seats_total ?? null;
  return (
    <FormSection title={t("sections.departures")}>
      <p className="text-sm text-muted-foreground">{t("departures.lead")}</p>
      {!pkg.fixed_departures ? (
        <Callout tone="warning">{t("departures.privateTour")}</Callout>
      ) : upcoming.length === 0 ? (
        <Callout tone="warning">{t("departures.noneUpcoming")}</Callout>
      ) : null}
      {departures.map((d) => (
        <DepartureRow
          key={`${d.id}-${d.updated_at}`}
          values={departureFormValues(d)}
          departure={d}
          today={today}
        />
      ))}
      <DepartureRow
        key={`new-${departures.length}`}
        values={newDepartureValues(pkg.id, lastSeats)}
        today={today}
        isNew
      />
    </FormSection>
  );
}
