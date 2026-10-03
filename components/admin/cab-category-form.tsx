"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { registerCabMedia, saveCategory } from "@/lib/cabs/admin-actions";
import { CAB_BODY_TYPES, FUEL_TYPES, categoryFormSchema, type CategoryFormInput } from "@/schemas/cab-admin";
import { FormIssue, useCabSave } from "./cab-shared";
import {
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import { FormSection, SubmitBar } from "./hotel-shared";
import { ImageUploader } from "./image-uploader";

/** A vehicle category (what customers book) with its example models inline. */
export function CategoryForm({
  defaultValues,
  imageUrl,
  listHref,
  deleteButton,
}: {
  defaultValues: CategoryFormInput;
  imageUrl: string | null;
  listHref: string;
  deleteButton?: ReactNode;
}) {
  const t = useTranslations("cabsAdmin");
  const form = useForm<CategoryFormInput>({
    resolver: zodResolver(categoryFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const models = useFieldArray({ control: form.control, name: "models", keyName: "key" });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = useCabSave(form, saveCategory, { isNew, afterCreate: () => listHref });
  useUnsavedChangesWarning(form.formState.isDirty);
  const [preview, setPreview] = useState(imageUrl);
  const imageId = form.watch("image_id");
  const name = form.watch("name");

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <FormSection title={t("categories.sections.category")}>
          <LocalizedField<CategoryFormInput> name="name" label={t("fields.name")} />
          <LocalizedField<CategoryFormInput> name="description" label={t("fields.description")} multiline />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextInputField<CategoryFormInput>
              name="key"
              label={t("fields.key")}
              placeholder="sedan"
              help={t("fields.slugHelp")}
            />
            <SelectField<CategoryFormInput>
              name="body_type"
              label={t("categories.bodyType")}
              options={CAB_BODY_TYPES.map((b) => ({ value: b, label: t(`categories.bodyTypes.${b}`) }))}
            />
            <TextInputField<CategoryFormInput> name="seats" label={t("categories.seats")} type="number" />
            <TextInputField<CategoryFormInput> name="luggage" label={t("categories.luggage")} type="number" />
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t("categories.image")}</span>
            <ImageUploader
              value={imageId}
              previewUrl={preview}
              collection="cabs"
              alt={{ en: name?.en || "Cab", hi: name?.hi || null }}
              register={registerCabMedia}
              onChange={(id, url) => {
                form.setValue("image_id", id ?? "", { shouldDirty: true });
                setPreview(url);
              }}
            />
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <TextInputField<CategoryFormInput>
              name="sort_order"
              label={t("fields.sortOrder")}
              type="number"
              className="w-28"
              help={t("categories.sortHelp")}
            />
            <SwitchField<CategoryFormInput> name="is_ac" label={t("categories.ac")} />
            <SwitchField<CategoryFormInput> name="is_active" label={t("fields.active")} />
          </div>
        </FormSection>

        <FormSection title={t("categories.sections.models")}>
          <p className="text-sm text-muted-foreground">{t("categories.modelsLead")}</p>
          {models.fields.map((field, index) => (
            <div
              key={field.key}
              className="grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_10rem_auto]"
            >
              <TextInputField<CategoryFormInput>
                name={`models.${index}.name`}
                label={t("categories.modelName")}
                placeholder="Maruti Swift Dzire"
              />
              <SelectField<CategoryFormInput>
                name={`models.${index}.fuel`}
                label={t("categories.fuel")}
                options={FUEL_TYPES.map((f) => ({ value: f, label: t(`fuels.${f}`) }))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("categories.removeModel")}
                onClick={() => models.remove(index)}
              >
                <Trash2 />
              </Button>
              <div className="flex flex-wrap gap-6 sm:col-span-3">
                <SwitchField<CategoryFormInput>
                  name={`models.${index}.is_featured`}
                  label={t("categories.featured")}
                />
                <SwitchField<CategoryFormInput>
                  name={`models.${index}.is_active`}
                  label={t("fields.active")}
                />
              </div>
            </div>
          ))}
          {models.fields.length < 20 ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() =>
                models.append({
                  name: "",
                  fuel: "cng",
                  is_featured: models.fields.length === 0,
                  is_active: true,
                })
              }
            >
              <Plus /> {t("categories.addModel")}
            </Button>
          ) : null}
        </FormSection>

        <FormIssue />
        <SubmitBar pending={pending} isNew={isNew} extra={deleteButton} />
      </form>
    </FormProvider>
  );
}
