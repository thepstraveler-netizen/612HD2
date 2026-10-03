"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ExternalLink, Play, X, ZoomIn } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PortfolioItem } from "@/lib/catalog/b2b-ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { cn } from "@/lib/utils";

/**
 * Portfolio grid of a B2B service page. Photos open in a lightbox (with
 * previous / next); link-only items (reels, videos, live listings) open in
 * a new tab.
 */
export function PortfolioGallery({ items, locale }: { items: PortfolioItem[]; locale: string }) {
  const t = useTranslations("servicePage.portfolio");
  const photos = items.filter((i) => i.image);
  const [open, setOpen] = useState<number | null>(null);
  const current = open === null ? null : photos[open];

  const step = (delta: number) =>
    setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length));

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const title = pickLocalized(item.title, locale);
          const caption = item.caption ? pickLocalized(item.caption, locale) : "";
          const meta = (
            <span className="block space-y-0.5 p-3 text-start">
              <span className="line-clamp-2 block text-sm font-semibold">{title}</span>
              {item.clientName ? (
                <span className="block truncate text-xs text-muted-foreground">{item.clientName}</span>
              ) : null}
              {caption ? (
                <span className="line-clamp-2 block text-xs text-muted-foreground">{caption}</span>
              ) : null}
            </span>
          );
          const cardClass =
            "group block h-full w-full overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

          if (item.image) {
            const index = photos.indexOf(item);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={cardClass}
                  onClick={() => setOpen(index)}
                  aria-label={t("open", { title })}
                >
                  <span className="relative block aspect-[4/3] bg-muted">
                    <Image
                      src={item.image.src}
                      alt=""
                      fill
                      sizes="(min-width: 768px) 15rem, (min-width: 640px) 33vw, 50vw"
                      className="object-cover transition-transform group-hover:scale-[1.03]"
                    />
                    <span className="absolute end-2 bottom-2 grid size-8 place-items-center rounded-full bg-black/60 text-white">
                      {item.linkUrl ? (
                        <Play className="size-4" aria-hidden="true" />
                      ) : (
                        <ZoomIn className="size-4" aria-hidden="true" />
                      )}
                    </span>
                  </span>
                  {meta}
                </button>
              </li>
            );
          }
          return (
            <li key={item.id}>
              <a
                href={item.linkUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(cardClass, "flex flex-col")}
              >
                <span className="grid aspect-[4/3] place-items-center bg-secondary text-secondary-foreground">
                  <Play className="size-8" aria-hidden="true" />
                </span>
                {meta}
                <span className="mt-auto flex min-h-11 items-center gap-1.5 px-3 pb-3 text-sm font-medium text-primary">
                  {t("viewLink")} <ExternalLink className="size-4" aria-hidden="true" />
                  <span className="sr-only">{t("newTab")}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      <Dialog.Root open={current !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
          <Dialog.Content
            className="fixed inset-0 z-50 flex flex-col p-4 text-white outline-none sm:p-8"
            onKeyDown={(e) => {
              if (photos.length < 2) return;
              if (e.key === "ArrowRight") step(1);
              if (e.key === "ArrowLeft") step(-1);
            }}
          >
            {current?.image ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Dialog.Title className="font-semibold">
                      {pickLocalized(current.title, locale)}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-white/80">
                      {[current.clientName, current.caption ? pickLocalized(current.caption, locale) : ""]
                        .filter(Boolean)
                        .join(" · ") || t("counter", { current: (open ?? 0) + 1, total: photos.length })}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <Button type="button" size="icon" variant="secondary" aria-label={t("close")}>
                      <X />
                    </Button>
                  </Dialog.Close>
                </div>
                <div className="relative my-4 flex-1">
                  <Image
                    src={current.image.src}
                    alt={
                      current.image.alt
                        ? pickLocalized(current.image.alt, locale)
                        : pickLocalized(current.title, locale)
                    }
                    fill
                    sizes="100vw"
                    className="object-contain"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {photos.length > 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      onClick={() => step(-1)}
                      aria-label={t("previous")}
                    >
                      <ChevronLeft className="rtl:rotate-180" />
                    </Button>
                  ) : null}
                  {current.linkUrl ? (
                    <Button asChild variant="secondary">
                      <a href={current.linkUrl} target="_blank" rel="noopener noreferrer">
                        {t("viewLink")} <ExternalLink aria-hidden="true" />
                        <span className="sr-only">{t("newTab")}</span>
                      </a>
                    </Button>
                  ) : null}
                  {photos.length > 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      onClick={() => step(1)}
                      aria-label={t("next")}
                    >
                      <ChevronRight className="rtl:rotate-180" />
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
