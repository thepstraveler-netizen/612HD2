import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { CatalogService } from "@/lib/catalog/types";
import { pickLocalized } from "@/lib/i18n/localized";
import { getIcon } from "@/lib/icons";
import { ACCENT_CLASSES } from "@/lib/services";
import { cn } from "@/lib/utils";

/**
 * Poster-style service tile: coloured circular icon badge, title, blurb.
 * On phones it is a compact stacked tile meant for a two-column grid.
 */
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

  const directLinks: Record<string, string> = {
    food: "/food",
    essentials: "/essentials",
    medicine: "/medicine",
  };
  const href = directLinks[service.slug] || `/services/${service.slug}`;

  return (
    <Link
      href={href}
      className="group flex h-full flex-col gap-2.5 rounded-2xl border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98] motion-reduce:transition-none sm:flex-row sm:gap-4 sm:p-4 sm:active:scale-100"
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full ring-4 sm:size-12",
          accent.badge,
          accent.ring,
        )}
      >
        <Icon className="size-5 sm:size-6" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm leading-snug font-semibold text-heading sm:text-base">
          {pickLocalized(service.name, locale)}
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground sm:line-clamp-none sm:text-sm">
          {pickLocalized(service.summary, locale)}
        </span>
        {/* The accent colours are too light for small text on white (WCAG AA); the badge carries the accent. */}
        <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold text-primary sm:text-sm">
          {service.ctaLabel ? pickLocalized(service.ctaLabel, locale) : cta}
          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}
