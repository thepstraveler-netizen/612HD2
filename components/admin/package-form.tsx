"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { registerPackageMedia, savePackage } from "@/lib/packages/admin-actions";
import type { GalleryImage } from "@/lib/packages/admin";
import { createClient } from "@/lib/supabase/client";
import { PACKAGE_BOOKING_MODES, packageFormSchema, type PackageFormInput } from "@/schemas/package-admin";
import {
  LocalizedField,
  SelectField,
  SwitchField,
  TextInputField,
  useUnsavedChangesWarning,
} from "./form-fields";
import { FormSection, SubmitBar } from "./hotel-shared";
import { ImageUploader } from "./image-uploader";
import { LocalizedListField, PackageFormIssue, usePackageSave } from "./package-shared";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_GALLERY = 30;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
const EXT: Record<(typeof TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function readDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve({ width: null, height: null });
    img.src = url;
  });
}

/**
 * Gallery photos bound to the form's `gallery_ids`: uploads go straight to
 * the `media` bucket and are registered (as in ImageUploader); order and
 * removals are saved with the package.
 */
function GalleryField({ initial }: { initial: GalleryImage[] }) {
  const t = useTranslations("packagesAdmin.photos");
  const tu = useTranslations("cms.upload");
  const { setValue, watch } = useFormContext<PackageFormInput>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState(() => new Map(initial.map((i) => [i.mediaId, i.url])));
  const [busy, setBusy] = useState(false);
  const ids = watch("gallery_ids");
  const title = watch("title");
  const set = (next: string[]) => setValue("gallery_ids", next, { shouldDirty: true });

  const uploadOne = async (file: File): Promise<GalleryImage | null> => {
    if (!TYPES.includes(file.type as (typeof TYPES)[number])) {
      toast.error(tu("badType"));
      return null;
    }
    if (file.size > MAX_BYTES) {
      toast.error(tu("tooBig"));
      return null;
    }
    const path = `packages/${crypto.randomUUID()}.${EXT[file.type as (typeof TYPES)[number]]}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("media").upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;
    const dims = await readDimensions(file);
    const result = await registerPackageMedia({
      path,
      mime_type: file.type,
      size_bytes: file.size,
      ...dims,
      alt: { en: title?.en || "Tour package", hi: title?.hi || null },
      collection: "packages",
    });
    if (!result.ok || !result.id) throw new Error(result.ok ? "no id" : result.error);
    return { mediaId: result.id, url: supabase.storage.from("media").getPublicUrl(path).data.publicUrl };
  };

  const upload = async (files: File[]) => {
    setBusy(true);
    const added: GalleryImage[] = [];
    for (const file of files) {
      try {
        const image = await uploadOne(file);
        if (image) added.push(image);
      } catch (error) {
        console.error(error);
        toast.error(tu("failed"));
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (added.length) {
      setUrls((m) => new Map([...m, ...added.map((a) => [a.mediaId, a.url] as const)]));
      set([...ids, ...added.map((a) => a.mediaId)].slice(0, MAX_GALLERY));
    }
  };

  const move = (index: number, delta: number) => {
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    set(next);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-sm font-medium">{t("gallery")}</span>
          <p className="text-xs text-muted-foreground">{t("galleryHelp", { max: MAX_GALLERY })}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={TYPES.join(",")}
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void upload(files);
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={busy || ids.length >= MAX_GALLERY}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          {busy ? tu("uploading") : t("upload")}
        </Button>
      </div>
      {ids.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ids.map((id, index) => {
            const url = urls.get(id);
            return (
              <li key={id} className="overflow-hidden rounded-xl border bg-background">
                <div className="relative aspect-[4/3] bg-muted">
                  {url ? (
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 14rem, 45vw"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex justify-between gap-1 p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("moveUp")}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("moveDown")}
                    disabled={index === ids.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={t("remove")}
                    onClick={() => set(ids.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * A tour package: details, photos (cover and gallery), highlights,
 * inclusions and exclusions, booking terms and visibility. The itinerary,
 * pricing tiers and departures are edited below it, row by row.
 */
export function PackageForm({
  defaultValues,
  imageUrl,
  gallery,
  listHref,
  extra,
}: {
  defaultValues: PackageFormInput;
  imageUrl: string | null;
  gallery: GalleryImage[];
  listHref: string;
  extra?: ReactNode;
}) {
  const t = useTranslations("packagesAdmin");
  const form = useForm<PackageFormInput>({
    resolver: zodResolver(packageFormSchema, undefined, { raw: true }),
    defaultValues,
  });
  const isNew = !defaultValues.id;
  const { pending, onSubmit } = usePackageSave(form, savePackage, {
    isNew,
    afterCreate: (id) => (id ? `${listHref}/${id}` : listHref),
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  const [preview, setPreview] = useState(imageUrl);
  const imageId = form.watch("image_id");
  const title = form.watch("title");
  const mode = form.watch("booking_mode");

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
        <span id="details" className="-mb-5 block scroll-mt-20" aria-hidden="true" />
        <FormSection title={t("sections.details")}>
          <LocalizedField<PackageFormInput> name="title" label={t("fields.title")} />
          <LocalizedField<PackageFormInput> name="summary" label={t("fields.summary")} multiline />
          <LocalizedField<PackageFormInput> name="description" label={t("fields.description")} multiline />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField<PackageFormInput>
              name="slug"
              label={t("fields.slug")}
              placeholder="braj-84-kos-yatra"
              help={t("fields.slugHelp")}
            />
            <TextInputField<PackageFormInput>
              name="category"
              label={t("fields.category")}
              placeholder="pilgrimage"
              help={t("fields.categoryHelp")}
            />
            <TextInputField<PackageFormInput>
              name="destinations"
              label={t("fields.destinations")}
              placeholder="Vrindavan, Mathura, Govardhan"
              help={t("fields.destinationsHelp")}
            />
            <TextInputField<PackageFormInput>
              name="start_city"
              label={t("fields.startCity")}
              placeholder="Vrindavan"
            />
            <TextInputField<PackageFormInput> name="duration_days" label={t("fields.days")} type="number" />
            <TextInputField<PackageFormInput>
              name="duration_nights"
              label={t("fields.nights")}
              type="number"
              help={t("fields.nightsHelp")}
            />
          </div>
        </FormSection>

        <span id="photos" className="-mb-5 block scroll-mt-20" aria-hidden="true" />
        <FormSection title={t("sections.photos")}>
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t("photos.cover")}</span>
            <ImageUploader
              value={imageId}
              previewUrl={preview}
              collection="packages"
              alt={{ en: title?.en || "Tour package", hi: title?.hi || null }}
              register={registerPackageMedia}
              onChange={(id, url) => {
                form.setValue("image_id", id ?? "", { shouldDirty: true });
                setPreview(url);
              }}
            />
          </div>
          <GalleryField initial={gallery} />
        </FormSection>

        <FormSection title={t("sections.content")}>
          <LocalizedListField<PackageFormInput>
            name="highlights"
            label={t("fields.highlights")}
            placeholder={t("lists.highlightPlaceholder")}
          />
          <LocalizedListField<PackageFormInput>
            name="inclusions"
            label={t("fields.inclusions")}
            placeholder={t("lists.inclusionPlaceholder")}
          />
          <LocalizedListField<PackageFormInput>
            name="exclusions"
            label={t("fields.exclusions")}
            placeholder={t("lists.exclusionPlaceholder")}
          />
          <LocalizedField<PackageFormInput> name="terms" label={t("fields.terms")} multiline />
        </FormSection>

        <FormSection title={t("sections.booking")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField<PackageFormInput>
              name="booking_mode"
              label={t("fields.bookingMode")}
              options={PACKAGE_BOOKING_MODES.map((m) => ({ value: m, label: t(`modes.${m}`) }))}
            />
            <TextInputField<PackageFormInput>
              name="advance_percent"
              label={t("fields.advance")}
              help={t("fields.advanceHelp")}
              placeholder="25"
            />
            <TextInputField<PackageFormInput> name="min_pax" label={t("fields.minPax")} type="number" />
            <TextInputField<PackageFormInput> name="max_pax" label={t("fields.maxPax")} type="number" />
            <TextInputField<PackageFormInput>
              name="gst_percent"
              label={t("fields.gst")}
              help={t("fields.gstHelp")}
            />
            <TextInputField<PackageFormInput> name="sac" label={t("fields.sac")} placeholder="998555" />
          </div>
          <p className="text-xs text-muted-foreground">{t(`modes.${mode}Help`)}</p>
          <SwitchField<PackageFormInput> name="fixed_departures" label={t("fields.fixedDepartures")} />
          <p className="-mt-2 text-xs text-muted-foreground">{t("fields.fixedDeparturesHelp")}</p>
        </FormSection>

        <FormSection title={t("sections.visibility")}>
          <div className="flex flex-wrap items-end gap-6">
            <TextInputField<PackageFormInput>
              name="sort_order"
              label={t("fields.sortOrder")}
              type="number"
              className="w-28"
            />
            <SwitchField<PackageFormInput> name="is_featured" label={t("fields.featured")} />
            <SwitchField<PackageFormInput> name="is_active" label={t("fields.active")} />
          </div>
          <p className="text-xs text-muted-foreground">{t("fields.activeHelp")}</p>
        </FormSection>
        <PackageFormIssue />
        <SubmitBar pending={pending} isNew={isNew} extra={extra} />
      </form>
    </FormProvider>
  );
}
