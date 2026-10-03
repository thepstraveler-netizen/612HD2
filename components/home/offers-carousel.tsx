"use client";

import { Copy, TicketPercent } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Banner } from "@/lib/catalog/types";
import { ACCENT_CLASSES } from "@/lib/services";
import { cn } from "@/lib/utils";

const TABS = ["all", "hotels", "cabs", "food", "packages"] as const;

/**
 * A banner with its text already picked for the page's language on the server,
 * so this client component doesn't ship the localized-JSON helpers (and zod).
 */
export type OfferBanner = Omit<Banner, "title" | "subtitle" | "ctaLabel"> & {
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
};

/** Admin-managed offer banners with category tabs and copyable coupon codes. */
export function OffersCarousel({ banners }: { banners: OfferBanner[] }) {
  const t = useTranslations("offers");
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const visible = tab === "all" ? banners : banners.filter((b) => b.tab === tab);
  const tabsWithOffers = TABS.filter((key) => key === "all" || banners.some((b) => b.tab === key));

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("copied", { code }));
    } catch {
      toast.message(code);
    }
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t("tabs.all")} className="flex gap-2 overflow-x-auto pb-1">
        {tabsWithOffers.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition",
              tab === key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2" role="tabpanel">
          {visible.map((banner) => {
            const accent = ACCENT_CLASSES[banner.accent];
            return (
              <li key={banner.id} className="w-[85%] shrink-0 snap-start sm:w-[22rem]">
                <article className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <div className={cn("relative grid h-36 place-items-center", accent.soft)}>
                    {banner.image ? (
                      <Image
                        src={banner.image}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 22rem, 85vw"
                        className="object-cover"
                      />
                    ) : (
                      <TicketPercent className={cn("size-14", accent.text)} aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <h3 className="text-lg font-bold">{banner.title}</h3>
                    {banner.subtitle ? (
                      <p className="text-sm text-muted-foreground">{banner.subtitle}</p>
                    ) : null}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                      {banner.couponCode ? (
                        <button
                          type="button"
                          onClick={() => copy(banner.couponCode!)}
                          aria-label={`${t("copy")}: ${banner.couponCode}`}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-primary/50 px-3 font-mono text-sm font-semibold text-primary"
                        >
                          {banner.couponCode}
                          <Copy className="size-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <span />
                      )}
                      {banner.href ? (
                        <Button asChild size="sm" className="h-10">
                          <Link href={banner.href}>{banner.ctaLabel ?? "→"}</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
