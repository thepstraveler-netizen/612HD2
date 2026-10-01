"use client";

import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type CarouselImage = { url: string; alt: string };

/**
 * Swipeable photo strip (CSS scroll-snap) with arrow buttons on hover and a
 * position counter. Only the first image loads eagerly.
 */
export function PhotoCarousel({
  images,
  sizes,
  className,
  priority = false,
}: {
  images: CarouselImage[];
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const t = useTranslations("hotels.card");
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className={cn("grid place-items-center bg-muted text-muted-foreground", className)}>
        <ImageOff className="size-8" aria-hidden="true" />
        <span className="sr-only">{t("noPhotos")}</span>
      </div>
    );
  }

  const go = (to: number) => {
    const el = track.current;
    if (!el) return;
    const next = (to + images.length) % images.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className={cn("group relative overflow-hidden bg-muted", className)}>
      <div
        ref={track}
        className="flex size-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
        }}
      >
        {images.map((image, i) => (
          <div key={image.url} className="relative size-full shrink-0 snap-start">
            <Image
              src={image.url}
              alt={image.alt}
              fill
              sizes={sizes}
              priority={priority && i === 0}
              loading={priority && i === 0 ? undefined : "lazy"}
              className="object-cover"
            />
          </div>
        ))}
      </div>
      {images.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={t("prevPhoto")}
            className="absolute top-1/2 left-2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={t("nextPhoto")}
            className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
          <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {index + 1}/{images.length}
          </span>
        </>
      ) : null}
    </div>
  );
}
