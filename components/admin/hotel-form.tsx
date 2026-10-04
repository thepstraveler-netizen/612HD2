"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { FormProvider, useFieldArray, useForm, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { saveHotel } from "@/lib/hotels/actions";
import type { HotelFormOptions } from "@/lib/hotels/admin";
import { pickLocalized } from "@/lib/i18n/localized";
import {
  hotelFormSchema,
  ID_PROOFS,
  PROPERTY_TYPES,
  PUBLISH_STATUSES,
  type HotelFormInput,
} from "@/schemas/hotels";
import {
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import {
  CheckboxGroupField,
  FormSection,
  SubmitBar,
  useHotelSave,
  useLocalizedOptions,
} from "./hotel-shared";
import { SectionJumpNav } from "./section-jump-nav";

/** Form sections in page order, for the phone jump menu. */
const HOTEL_SECTIONS = [
  "basics",
  "location",
  "stay",
  "tags",
  "policies",
  "amenities",
  "payment",
  "partner",
  "rating",
  "seo",
] as const;

/** Repeating `{ en, hi }` rows (highlights, house rules). */
function LocalizedList({
  form,
  name,
  label,
  addLabel,
  max,
}: {
  form: UseFormReturn<HotelFormInput>;
  name: "highlights" | "policies.rules";
  label: string;
  addLabel: string;
  max: number;
}) {
  const t = useTranslations("hotelsAdmin.fields");
  const list = useFieldArray({ control: form.control, name: name as never });
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {list.fields.map((field, index) => (
        <div key={field.id} className="flex items-start gap-2">
          <LocalizedField<HotelFormInput>
            name={`${name}.${index}` as "highlights"}
            label={`#${index + 1}`}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("remove")}
            onClick={() => list.remove(index)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {list.fields.length < max ? (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() => list.append({ en: "", hi: "" } as never)}
        >
          <Plus /> {addLabel}
        </Button>
      ) : null}
    </fieldset>
  );
}

export function HotelForm({
  defaultValues,
  options,
  editHref,
  deleteButton,
}: {
  defaultValues: HotelFormInput;
  options: HotelFormOptions;
  /** Path prefix of the edit page; a new hotel opens there after creating. */
  editHref: string;
  deleteButton?: React.ReactNode;
}) {
  const t = useTranslations("hotelsAdmin");
  const tUi = useTranslations("admin.ui");
  const locale = useLocale();
  const form = useForm<HotelFormInput>({
    resolver: zodResolver(hotelFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useHotelSave(form, saveHotel, {
    isNew,
    afterCreate: (id) => (id ? `${editHref}/${id}` : editHref),
  });
  useUnsavedChangesWarning(form.formState.isDirty);

  const cities = useLocalizedOptions(options.cities);
  const cityId = form.watch("city_id");
  const areas = options.areas.filter((a) => a.cityId === cityId);
  const areaId = form.watch("area_id");
  // An area from another city is cleared when the city changes.
  useEffect(() => {
    if (areaId && !options.areas.some((a) => a.value === areaId && a.cityId === cityId)) {
      form.setValue("area_id", "", { shouldDirty: true });
    }
  }, [areaId, cityId, form, options.areas]);

  const amenityGroups = new Map<string, { value: string; label: string }[]>();
  for (const a of options.amenities) {
    const list = amenityGroups.get(a.grouping) ?? [];
    list.push({ value: a.value, label: pickLocalized(a.label, locale) });
    amenityGroups.set(a.grouping, list);
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <SectionJumpNav
          className="lg:hidden"
          label={tUi("jumpTo")}
          items={HOTEL_SECTIONS.map((key) => ({ id: `hotel-${key}`, label: t(`sections.${key}`) }))}
        />
        <FormSection id="hotel-basics" title={t("sections.basics")}>
          <LocalizedField<HotelFormInput> name="name" label={t("fields.name")} />
          <LocalizedField<HotelFormInput> name="summary" label={t("fields.summary")} />
          <LocalizedField<HotelFormInput> name="description" label={t("fields.description")} multiline />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextInputField<HotelFormInput>
              name="slug"
              label={t("fields.slug")}
              placeholder="radha-kunj-stay"
            />
            <SelectField<HotelFormInput>
              name="property_type"
              label={t("fields.propertyType")}
              options={PROPERTY_TYPES.map((p) => ({ value: p, label: t(`propertyTypes.${p}`) }))}
            />
            <SelectField<HotelFormInput>
              name="star_rating"
              label={t("fields.starRating")}
              options={[0, 1, 2, 3, 4, 5].map((n) => ({
                value: String(n),
                label: n === 0 ? t("fields.unrated") : "★".repeat(n),
              }))}
            />
            <SelectField<HotelFormInput>
              name="status"
              label={t("fields.status")}
              options={PUBLISH_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
            />
            <TextInputField<HotelFormInput> name="sort_order" label={t("fields.sortOrder")} type="number" />
          </div>
        </FormSection>

        <FormSection id="hotel-location" title={t("sections.location")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField<HotelFormInput> name="city_id" label={t("fields.city")} options={cities} />
            <SelectField<HotelFormInput>
              name="area_id"
              label={t("fields.area")}
              options={[
                { value: "", label: t("fields.noArea") },
                ...areas.map((a) => ({ value: a.value, label: pickLocalized(a.label, locale) })),
              ]}
            />
          </div>
          <TextInputField<HotelFormInput> name="address" label={t("fields.address")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<HotelFormInput> name="lat" label={t("fields.lat")} placeholder="27.5806" />
            <TextInputField<HotelFormInput> name="lng" label={t("fields.lng")} placeholder="77.7006" />
          </div>
        </FormSection>

        <FormSection id="hotel-stay" title={t("sections.stay")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<HotelFormInput> name="check_in_time" label={t("fields.checkIn")} type="time" />
            <TextInputField<HotelFormInput> name="check_out_time" label={t("fields.checkOut")} type="time" />
          </div>
          <LocalizedList
            form={form}
            name="highlights"
            label={t("fields.highlights")}
            addLabel={t("fields.addHighlight")}
            max={12}
          />
          <LocalizedField<HotelFormInput> name="food_dining" label={t("fields.foodDining")} multiline />
        </FormSection>

        <FormSection id="hotel-tags" title={t("sections.tags")}>
          <div className="flex flex-wrap gap-x-6">
            <SwitchField<HotelFormInput> name="is_couple_friendly" label={t("fields.coupleFriendly")} />
            <SwitchField<HotelFormInput> name="is_featured" label={t("fields.featured")} />
            <SwitchField<HotelFormInput> name="is_sponsored" label={t("fields.sponsored")} />
          </div>
        </FormSection>

        <FormSection id="hotel-policies" title={t("sections.policies")}>
          <div className="grid gap-x-6 sm:grid-cols-2">
            <SwitchField<HotelFormInput>
              name="policies.unmarried_couples_allowed"
              label={t("fields.unmarriedCouples")}
            />
            <SwitchField<HotelFormInput> name="policies.bachelors_allowed" label={t("fields.bachelors")} />
            <SwitchField<HotelFormInput> name="policies.local_ids_allowed" label={t("fields.localIds")} />
            <SwitchField<HotelFormInput> name="policies.pets_allowed" label={t("fields.pets")} />
          </div>
          <CheckboxGroupField<HotelFormInput, string>
            name="policies.id_proofs"
            label={t("fields.idProofs")}
            options={ID_PROOFS.map((p) => ({ value: p, label: t(`idProofs.${p}`) }))}
          />
          <LocalizedList
            form={form}
            name="policies.rules"
            label={t("fields.rules")}
            addLabel={t("fields.addRule")}
            max={20}
          />
        </FormSection>

        <FormSection id="hotel-amenities" title={t("sections.amenities")}>
          {[...amenityGroups].map(([group, list]) => (
            <CheckboxGroupField<HotelFormInput, string>
              key={group}
              name="amenity_ids"
              label={t.has(`amenityGroups.${group}`) ? t(`amenityGroups.${group}`) : group}
              options={list}
            />
          ))}
        </FormSection>

        <FormSection id="hotel-payment" title={t("sections.payment")}>
          <SwitchField<HotelFormInput> name="pay_at_hotel_enabled" label={t("fields.payAtHotel")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<HotelFormInput>
              name="part_payment_percent"
              label={t("fields.partPayment")}
              help={t("fields.partPaymentHelp")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInputField<HotelFormInput>
              name="early_checkin"
              label={t("fields.earlyCheckin")}
              help={t("fields.rupeesHelp")}
            />
            <TextInputField<HotelFormInput>
              name="late_checkout"
              label={t("fields.lateCheckout")}
              help={t("fields.rupeesHelp")}
            />
            <TextInputField<HotelFormInput>
              name="breakfast_addon"
              label={t("fields.breakfastAddon")}
              help={t("fields.rupeesHelp")}
            />
          </div>
        </FormSection>

        <FormSection id="hotel-partner" title={t("sections.partner")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField<HotelFormInput>
              name="vendor_id"
              label={t("fields.vendor")}
              options={[{ value: "", label: t("fields.noVendor") }, ...options.vendors]}
            />
            <TextInputField<HotelFormInput>
              name="commission_percent"
              label={t("fields.commission")}
              help={t("fields.commissionHelp")}
            />
          </div>
        </FormSection>

        <FormSection id="hotel-rating" title={t("sections.rating")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<HotelFormInput>
              name="rating_avg"
              label={t("fields.ratingAvg")}
              placeholder="4.3"
            />
            <TextInputField<HotelFormInput>
              name="rating_count"
              label={t("fields.ratingCount")}
              type="number"
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("fields.ratingHelp")}</p>
        </FormSection>

        <FormSection id="hotel-seo" title={t("sections.seo")}>
          <TextInputField<HotelFormInput> name="seo_title" label={t("fields.seoTitle")} />
          <TextInputField<HotelFormInput> name="seo_description" label={t("fields.seoDescription")} />
        </FormSection>

        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}
