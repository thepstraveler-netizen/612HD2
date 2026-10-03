"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  registerMedia,
  registerOfferMedia,
  saveBanner,
  saveFaq,
  saveNavLink,
  saveSection,
  saveService,
  saveTestimonial,
} from "@/lib/cms/actions";
import { ICON_NAMES } from "@/lib/icons";
import {
  bannerFormSchema,
  faqFormSchema,
  navLinkFormSchema,
  NAV_MENUS,
  OFFER_TABS,
  sectionFormSchema,
  SERVICE_ACCENTS,
  serviceFormSchema,
  testimonialFormSchema,
  type BannerFormInput,
  type FaqFormInput,
  type NavLinkFormInput,
  type SectionFormInput,
  type ServiceFormInput,
  type TestimonialFormInput,
} from "@/schemas/cms";
import {
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import { ImageUploader } from "./image-uploader";
import { fromLocalInput, toLocalInput, useSave } from "./use-save";

function FormActions({
  pending,
  isNew,
  extra,
}: {
  pending: boolean;
  isNew: boolean;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("cms.actions");
  return (
    <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
      <div>{extra}</div>
      <Button type="submit" disabled={pending}>
        {isNew ? t("create") : t("save")}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ service

export function ServiceForm({
  defaultValues,
  heroPreview,
  listHref,
}: {
  defaultValues: ServiceFormInput;
  heroPreview: string | null;
  listHref: string;
}) {
  const t = useTranslations("cms.fields");
  const form = useForm<ServiceFormInput>({
    resolver: zodResolver(serviceFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const highlights = useFieldArray({ control: form.control, name: "highlights" as never });
  const [preview, setPreview] = useState(heroPreview);
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useSave(form, saveService, { listHref, isNew });
  useUnsavedChangesWarning(form.formState.isDirty);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <LocalizedField<ServiceFormInput> name="name" label={t("name")} />
        <LocalizedField<ServiceFormInput> name="summary" label={t("summary")} />
        <LocalizedField<ServiceFormInput> name="description" label={t("description")} multiline />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextInputField<ServiceFormInput> name="slug" label={t("slug")} />
          <SelectField<ServiceFormInput>
            name="kind"
            label={t("kind")}
            options={[
              { value: "bookable", label: t("kindBookable") },
              { value: "enquiry", label: t("kindEnquiry") },
            ]}
          />
          <SelectField<ServiceFormInput>
            name="accent"
            label={t("accent")}
            options={SERVICE_ACCENTS.map((a) => ({ value: a, label: a }))}
          />
          <SelectField<ServiceFormInput>
            name="icon"
            label={t("icon")}
            options={ICON_NAMES.map((i) => ({ value: i, label: i }))}
          />
        </div>

        <fieldset className="grid gap-3 rounded-xl border p-3">
          <legend className="px-1 text-sm font-medium">{t("highlights")}</legend>
          {highlights.fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              <LocalizedField<ServiceFormInput>
                name={`highlights.${index}` as "highlights"}
                label={`#${index + 1}`}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("remove")}
                onClick={() => highlights.remove(index)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => highlights.append({ en: "", hi: "" } as never)}
          >
            <Plus /> {t("addHighlight")}
          </Button>
        </fieldset>

        <LocalizedField<ServiceFormInput> name="cta_label" label={t("ctaLabel")} />

        <div className="grid gap-2">
          <Label>{t("heroImage")}</Label>
          <ImageUploader
            value={form.watch("hero_media_id")}
            previewUrl={preview}
            collection="services"
            alt={form.getValues("name")}
            register={registerMedia}
            onChange={(id, url) => {
              form.setValue("hero_media_id", id, { shouldDirty: true });
              setPreview(url);
            }}
          />
        </div>

        <div className="flex flex-wrap items-end gap-6">
          <TextInputField<ServiceFormInput>
            name="sort_order"
            label={t("sortOrder")}
            type="number"
            className="w-28"
          />
          <SwitchField<ServiceFormInput> name="is_published" label={t("published")} />
          <SwitchField<ServiceFormInput> name="show_in_nav" label={t("showInNav")} />
        </div>
        <FormActions pending={pending} isNew={isNew} />
      </form>
    </FormProvider>
  );
}

// ------------------------------------------------------------------ section

export function SectionForm({
  defaultValues,
  listHref,
}: {
  defaultValues: SectionFormInput;
  listHref: string;
}) {
  const t = useTranslations("cms.fields");
  const form = useForm<SectionFormInput>({
    resolver: zodResolver(sectionFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveSection, { listHref, isNew: false });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <LocalizedField<SectionFormInput> name="title" label={t("title")} />
        <LocalizedField<SectionFormInput> name="subtitle" label={t("subtitle")} multiline />
        <div className="grid gap-2">
          <Label htmlFor="f-contentJson">{t("content")}</Label>
          <Textarea
            id="f-contentJson"
            rows={14}
            className="font-mono text-xs"
            spellCheck={false}
            {...form.register("contentJson")}
          />
          <p className="text-xs text-muted-foreground">{t("contentHelp")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <TextInputField<SectionFormInput>
            name="sort_order"
            label={t("sortOrder")}
            type="number"
            className="w-28"
          />
          <SwitchField<SectionFormInput> name="is_visible" label={t("visible")} />
        </div>
        <FormActions pending={pending} isNew={false} />
      </form>
    </FormProvider>
  );
}

// ------------------------------------------------------------------ banner

export function BannerForm({
  defaultValues,
  imagePreview,
  listHref,
  deleteButton,
}: {
  defaultValues: BannerFormInput;
  imagePreview: string | null;
  listHref: string;
  deleteButton?: React.ReactNode;
}) {
  const t = useTranslations();
  const form = useForm<BannerFormInput>({
    resolver: zodResolver(bannerFormSchema, undefined, { raw: true }),
    // Stored as ISO; the datetime-local inputs work in the browser's zone.
    defaultValues: {
      ...defaultValues,
      starts_at: toLocalInput(defaultValues.starts_at),
      ends_at: toLocalInput(defaultValues.ends_at),
    },
  });
  const [preview, setPreview] = useState(imagePreview);
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useSave(form, saveBanner, {
    listHref,
    isNew,
    transform: (v) => ({ ...v, starts_at: fromLocalInput(v.starts_at), ends_at: fromLocalInput(v.ends_at) }),
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <LocalizedField<BannerFormInput> name="title" label={t("cms.fields.title")} />
        <LocalizedField<BannerFormInput> name="subtitle" label={t("cms.fields.subtitle")} />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField<BannerFormInput>
            name="tab"
            label={t("cms.fields.tab")}
            options={OFFER_TABS.map((tab) => ({ value: tab, label: t(`offers.tabs.${tab}`) }))}
          />
          <TextInputField<BannerFormInput>
            name="coupon_code"
            label={t("cms.fields.couponCode")}
            placeholder="KARTIK20"
          />
          <SelectField<BannerFormInput>
            name="accent"
            label={t("cms.fields.accent")}
            options={SERVICE_ACCENTS.map((a) => ({ value: a, label: a }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<BannerFormInput>
            name="href"
            label={t("cms.fields.href")}
            placeholder="/services/car"
          />
          <LocalizedField<BannerFormInput> name="cta_label" label={t("cms.fields.ctaLabel")} />
        </div>
        <div className="grid gap-2">
          <Label>{t("cms.fields.image")}</Label>
          <ImageUploader
            value={form.watch("media_id")}
            previewUrl={preview}
            collection="banners"
            alt={form.getValues("title")}
            register={registerOfferMedia}
            onChange={(id, url) => {
              form.setValue("media_id", id, { shouldDirty: true });
              setPreview(url);
            }}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<BannerFormInput>
            name="starts_at"
            label={t("cms.fields.startsAt")}
            type="datetime-local"
          />
          <TextInputField<BannerFormInput>
            name="ends_at"
            label={t("cms.fields.endsAt")}
            type="datetime-local"
          />
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <TextInputField<BannerFormInput>
            name="sort_order"
            label={t("cms.fields.sortOrder")}
            type="number"
            className="w-28"
          />
          <SwitchField<BannerFormInput> name="is_active" label={t("cms.fields.active")} />
        </div>
        <FormActions pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

// ------------------------------------------------------------------ testimonial

export function TestimonialForm({
  defaultValues,
  listHref,
  deleteButton,
}: {
  defaultValues: TestimonialFormInput;
  listHref: string;
  deleteButton?: React.ReactNode;
}) {
  const t = useTranslations("cms.fields");
  const form = useForm<TestimonialFormInput>({
    resolver: zodResolver(testimonialFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useSave(form, saveTestimonial, { listHref, isNew });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInputField<TestimonialFormInput> name="author_name" label={t("author")} />
          <TextInputField<TestimonialFormInput> name="author_place" label={t("place")} />
          <SelectField<TestimonialFormInput>
            name="rating"
            label={t("rating")}
            options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: "★".repeat(n) }))}
          />
        </div>
        <LocalizedField<TestimonialFormInput> name="quote" label={t("quote")} multiline />
        <div className="flex flex-wrap items-end gap-6">
          <TextInputField<TestimonialFormInput>
            name="sort_order"
            label={t("sortOrder")}
            type="number"
            className="w-28"
          />
          <SwitchField<TestimonialFormInput> name="is_published" label={t("published")} />
        </div>
        <FormActions pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

// ------------------------------------------------------------------ faq

export function FaqForm({
  defaultValues,
  services,
  listHref,
  deleteButton,
}: {
  defaultValues: FaqFormInput;
  services: { value: string; label: string }[];
  listHref: string;
  deleteButton?: React.ReactNode;
}) {
  const t = useTranslations("cms.fields");
  const form = useForm<FaqFormInput>({
    resolver: zodResolver(faqFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useSave(form, saveFaq, { listHref, isNew });
  useUnsavedChangesWarning(form.formState.isDirty);
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <SelectField<FaqFormInput>
          name="service_id"
          label={t("service")}
          options={[{ value: "", label: t("general") }, ...services]}
          className="max-w-sm"
        />
        <LocalizedField<FaqFormInput> name="question" label={t("question")} />
        <LocalizedField<FaqFormInput> name="answer" label={t("answer")} multiline />
        <div className="flex flex-wrap items-end gap-6">
          <TextInputField<FaqFormInput>
            name="sort_order"
            label={t("sortOrder")}
            type="number"
            className="w-28"
          />
          <SwitchField<FaqFormInput> name="is_published" label={t("published")} />
        </div>
        <FormActions pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}

// ------------------------------------------------------------------ navigation

export function NavLinkForm({
  defaultValues,
  listHref,
  deleteButton,
}: {
  defaultValues: NavLinkFormInput;
  listHref: string;
  deleteButton?: React.ReactNode;
}) {
  const t = useTranslations("cms.fields");
  const form = useForm<NavLinkFormInput>({
    resolver: zodResolver(navLinkFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useSave(form, saveNavLink, { listHref, isNew });
  useUnsavedChangesWarning(form.formState.isDirty);
  const menuLabels: Record<(typeof NAV_MENUS)[number], string> = {
    header: t("menuHeader"),
    footer_company: t("menuFooterCompany"),
    footer_legal: t("menuFooterLegal"),
  };
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField<NavLinkFormInput>
            name="menu"
            label={t("menu")}
            options={NAV_MENUS.map((m) => ({ value: m, label: menuLabels[m] }))}
          />
          <TextInputField<NavLinkFormInput> name="href" label={t("href")} placeholder="/services/car" />
        </div>
        <LocalizedField<NavLinkFormInput> name="label" label={t("label")} />
        <div className="flex flex-wrap items-end gap-6">
          <TextInputField<NavLinkFormInput>
            name="sort_order"
            label={t("sortOrder")}
            type="number"
            className="w-28"
          />
          <SwitchField<NavLinkFormInput> name="is_visible" label={t("visible")} />
        </div>
        <FormActions pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}
