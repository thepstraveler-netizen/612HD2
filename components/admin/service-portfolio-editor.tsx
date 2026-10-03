"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ExternalLink, ImageIcon, Plus, Save } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { registerMedia } from "@/lib/cms/actions";
import { deleteServicePortfolioItem, saveServicePortfolioItem } from "@/lib/cms/service-b2b-actions";
import { pickLocalized } from "@/lib/i18n/localized";
import {
  newServicePortfolioValues,
  servicePortfolioFormSchema,
  servicePortfolioFormValues,
  type ServicePortfolioFormInput,
} from "@/schemas/service-b2b";
import type { Tables } from "@/types/database";
import { FormSection } from "./hotel-shared";
import { ImageUploader } from "./image-uploader";
import { MiniField, MiniSwitch, PackageDeleteButton, usePackageSave } from "./package-shared";

/**
 * CMS → Services → edit: portfolio items shown in the service page's
 * gallery. An item is a photo uploaded to the public `media` bucket, a
 * link (reel, video, live listing; https only), or both.
 */

export type AdminPortfolioItem = Tables<"service_portfolio"> & { imageUrl: string | null };

function PortfolioFields({
  values,
  imageUrl,
  isNew,
}: {
  values: ServicePortfolioFormInput;
  imageUrl: string | null;
  isNew?: boolean;
}) {
  const t = useTranslations("cms.portfolio");
  const form = useForm<ServicePortfolioFormInput>({
    resolver: zodResolver(servicePortfolioFormSchema, undefined, { raw: true }),
    defaultValues: values,
  });
  const [preview, setPreview] = useState<string | null>(imageUrl);
  const { pending, onSubmit } = usePackageSave(form, saveServicePortfolioItem, {
    isNew: false,
    onSaved: () => {
      if (isNew) {
        form.reset(values);
        setPreview(null);
      }
    },
  });
  const prefix = `portfolio-${values.id ?? "new"}`;
  const title = form.watch("title");
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <div className="grid gap-1">
        <p className="text-xs text-muted-foreground">{t("image")}</p>
        <ImageUploader
          value={form.watch("media_id")}
          previewUrl={preview}
          collection="services"
          alt={{ en: title?.en || t("imageAlt"), hi: title?.hi || null }}
          register={registerMedia}
          onChange={(mediaId, url) => {
            form.setValue("media_id", mediaId, { shouldDirty: true });
            setPreview(url);
          }}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <MiniField form={form} name="title.en" label={t("titleEn")} idPrefix={prefix} lang="en" />
        <MiniField form={form} name="title.hi" label={t("titleHi")} idPrefix={prefix} lang="hi" />
        <MiniField form={form} name="caption.en" label={t("captionEn")} idPrefix={prefix} lang="en" />
        <MiniField form={form} name="caption.hi" label={t("captionHi")} idPrefix={prefix} lang="hi" />
        <MiniField
          form={form}
          name="client_name"
          label={t("client")}
          idPrefix={prefix}
          placeholder={t("clientPlaceholder")}
        />
        <MiniField
          form={form}
          name="link_url"
          label={t("link")}
          idPrefix={prefix}
          type="url"
          inputMode="url"
          placeholder="https://www.instagram.com/reel/…"
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("linkHelp")}</p>
      <div className="grid items-end gap-2 sm:grid-cols-[7rem_1fr]">
        <MiniField
          form={form}
          name="sort_order"
          label={t("sortOrder")}
          idPrefix={prefix}
          type="number"
          inputMode="numeric"
        />
        <MiniSwitch form={form} name="is_published" label={t("published")} idPrefix={prefix} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {isNew ? <Plus /> : <Save />} {isNew ? t("add") : t("save")}
        </Button>
        {values.id ? (
          <PackageDeleteButton
            id={values.id}
            action={deleteServicePortfolioItem}
            confirmText={t("confirmDelete")}
          />
        ) : null}
      </div>
    </form>
  );
}

export function ServicePortfolioEditor({
  serviceId,
  items,
}: {
  serviceId: string;
  items: AdminPortfolioItem[];
}) {
  const t = useTranslations("cms.portfolio");
  const locale = useLocale();
  return (
    <FormSection title={t("title")}>
      <p className="text-sm text-muted-foreground">{t("lead")}</p>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : null}
      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={`${item.id}-${item.updated_at}`}>
            <details className="group rounded-xl border">
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  className="size-4 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
                <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt="" fill sizes="3rem" className="object-cover" />
                  ) : (
                    <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{pickLocalized(item.title, locale)}</span>
                  {item.client_name ? (
                    <span className="block truncate text-sm text-muted-foreground">{item.client_name}</span>
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {item.link_url ? (
                    <Badge variant="outline">
                      <ExternalLink className="size-3" aria-hidden="true" /> {t("hasLink")}
                    </Badge>
                  ) : null}
                  <Badge variant={item.is_published ? "secondary" : "outline"}>
                    {item.is_published ? t("published") : t("hidden")}
                  </Badge>
                  <Badge variant="outline">#{item.sort_order}</Badge>
                </span>
              </summary>
              <div className="border-t p-3">
                <PortfolioFields values={servicePortfolioFormValues(item)} imageUrl={item.imageUrl} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-dashed p-3">
        <h3 className="mb-3 text-sm font-semibold">{t("newTitle")}</h3>
        <PortfolioFields
          key={`new-${items.length}`}
          values={newServicePortfolioValues(serviceId, items)}
          imageUrl={null}
          isNew
        />
      </div>
    </FormSection>
  );
}
