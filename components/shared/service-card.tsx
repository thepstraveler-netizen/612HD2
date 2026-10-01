import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { CatalogService } from "@/lib/catalog/types";
import { pickLocalized } from "@/lib/i18n/localized";
import { getIcon } from "@/lib/icons";
import { ACCENT_CLASSES } from "@/lib/services";
import { cn } from "@/lib/utils";

/** Poster-style service tile: coloured circular icon badge, title, blurb. */
export function ServiceCard({
  service,
  locale,
  cta,
}: {
  service: CatalogService;
  locale: string;
  cta: string;
}) {
  const accent = ACCENT_CLASSES[service.accent];
  const Icon = getIcon(service.icon);
  return (
    <Link
      href={`/services/${service.slug}`}
      className="group flex h-full gap-4 rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-full ring-4",
          accent.badge,
          accent.ring,
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold text-heading">{pickLocalized(service.name, locale)}</span>
        <span className="text-sm text-muted-foreground">{pickLocalized(service.summary, locale)}</span>
        <span
          className={cn("mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold", accent.text)}
        >
          {service.ctaLabel ? pickLocalized(service.ctaLabel, locale) : cta}
          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}
