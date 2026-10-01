"use client";

import { ArrowDown, ArrowUp, ImagePlus, Loader2, Save, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { registerHotelMedia, saveHotelMedia } from "@/lib/hotels/actions";
import type { GalleryImage } from "@/lib/hotels/admin";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { createClient } from "@/lib/supabase/client";
import { useMutationErrorText } from "./hotel-shared";

const MAX_BYTES = 10 * 1024 * 1024;
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
 * Hotel photo gallery: uploads go straight to the `media` bucket (as in
 * ImageUploader), are registered, and attached at once; reordering and
 * removing are saved with "Save order". The first photo is the cover.
 */
export function HotelGallery({
  hotelId,
  initial,
  alt,
}: {
  hotelId: string;
  initial: GalleryImage[];
  alt: LocalizedJson;
}) {
  const t = useTranslations("hotelsAdmin.gallery");
  const tu = useTranslations("cms.upload");
  const errorText = useMutationErrorText();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  const persist = (list: GalleryImage[]) =>
    startTransition(async () => {
      const result = await saveHotelMedia({ hotel_id: hotelId, media_ids: list.map((i) => i.mediaId) });
      if (result.ok) {
        setDirty(false);
        toast.success(t("saved"));
      } else {
        toast.error(errorText(result.error));
      }
    });

  const uploadOne = async (file: File): Promise<GalleryImage | null> => {
    if (!TYPES.includes(file.type as (typeof TYPES)[number])) {
      toast.error(tu("badType"));
      return null;
    }
    if (file.size > MAX_BYTES) {
      toast.error(tu("tooBig"));
      return null;
    }
    const path = `hotels/${crypto.randomUUID()}.${EXT[file.type as (typeof TYPES)[number]]}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("media").upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;
    const dims = await readDimensions(file);
    const result = await registerHotelMedia({
      path,
      mime_type: file.type,
      size_bytes: file.size,
      ...dims,
      alt: { en: alt.en, hi: alt.hi ?? null },
      collection: "hotels",
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
      const next = [...images, ...added].slice(0, 60);
      setImages(next);
      persist(next);
    }
  };

  const move = (index: number, delta: number) => {
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setImages(next);
    setDirty(true);
  };

  const remove = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
    setDirty(true);
  };

  return (
    <section className="grid max-w-4xl gap-4 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("lead")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            disabled={busy || pending || images.length >= 60}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {busy ? tu("uploading") : t("upload")}
          </Button>
          <Button type="button" onClick={() => persist(images)} disabled={!dirty || pending || busy}>
            <Save /> {t("saveOrder")}
          </Button>
        </div>
      </div>
      {images.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <li key={image.mediaId} className="overflow-hidden rounded-xl border bg-background">
              <div className="relative aspect-[4/3] bg-muted">
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 14rem, 45vw"
                  className="object-cover"
                />
                {index === 0 ? (
                  <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    {t("cover")}
                  </span>
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
                  disabled={index === images.length - 1}
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
                  onClick={() => remove(index)}
                >
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {dirty ? <p className="text-sm text-accent-amber">{t("unsaved")}</p> : null}
    </section>
  );
}
