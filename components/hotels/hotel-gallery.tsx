"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PhotoCarousel, type CarouselImage } from "./photo-carousel";

/**
 * Detail-page photos: a carousel on phones, a five-tile mosaic on larger
 * screens, and a full-screen lightbox with keyboard arrows for all photos.
 */
export function HotelGallery({ images }: { images: CarouselImage[] }) {
  const t = useTranslations("hotels.detail");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const show = (i: number) => {
    setIndex(i);
    setOpen(true);
  };
  const step = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PhotoCarousel
          images={images}
          sizes="100vw"
          priority
          className="aspect-[4/3] rounded-2xl sm:hidden"
        />
        {images.length ? (
          <div className="hidden h-[26rem] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:grid">
            {images.slice(0, 5).map((image, i) => (
              <button
                key={image.url}
                type="button"
                onClick={() => show(i)}
                className={i === 0 ? "relative col-span-2 row-span-2" : "relative"}
                aria-label={t("openPhoto", { n: i + 1 })}
              >
                <Image
                  src={image.url}
                  alt={image.alt}
                  fill
                  priority={i === 0}
                  sizes={i === 0 ? "50vw" : "25vw"}
                  className="object-cover transition hover:brightness-90"
                />
              </button>
            ))}
          </div>
        ) : null}
        {images.length ? (
          <button
            type="button"
            onClick={() => show(0)}
            className="absolute bottom-3 left-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-black/60 px-4 text-sm font-medium text-white"
          >
            <Images className="size-4" aria-hidden="true" /> {t("allPhotos", { count: images.length })}
          </button>
        ) : null}
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex flex-col p-3 text-white sm:p-6"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") step(1);
            if (e.key === "ArrowLeft") step(-1);
          }}
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-sm">
              {t("photoOf", { n: index + 1, count: images.length })}
            </Dialog.Title>
            <Dialog.Close
              className="grid size-11 place-items-center rounded-full hover:bg-white/10"
              aria-label={t("close")}
            >
              <X />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{images[index]?.alt}</Dialog.Description>
          <div className="relative flex-1">
            {images[index] ? (
              <Image
                src={images[index].url}
                alt={images[index].alt}
                fill
                sizes="100vw"
                className="object-contain"
              />
            ) : null}
          </div>
          {images.length > 1 ? (
            <div className="flex items-center justify-center gap-4 pt-3">
              <button
                type="button"
                onClick={() => step(-1)}
                className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                aria-label={t("prevPhoto")}
              >
                <ChevronLeft />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                aria-label={t("nextPhoto")}
              >
                <ChevronRight />
              </button>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
