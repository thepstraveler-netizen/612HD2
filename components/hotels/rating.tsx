import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Property star category (hotel class), not guest rating. */
export function StarRow({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <Star key={i} className="size-3.5 fill-accent-amber text-accent-amber" aria-hidden="true" />
      ))}
    </span>
  );
}

/** Guest rating out of 5 with a word ("Excellent") and review count. */
export function RatingBadge({
  rating,
  count,
  className,
}: {
  rating: number;
  count: number;
  className?: string;
}) {
  const t = useTranslations("hotels.rating");
  const word = rating >= 4.5 ? "excellent" : rating >= 4 ? "veryGood" : rating >= 3.5 ? "good" : "fair";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="text-right leading-tight">
        <p className="text-sm font-semibold">{t(word)}</p>
        <p className="text-xs text-muted-foreground">{t("reviews", { count })}</p>
      </div>
      <span
        className="rounded-lg bg-brand-navy px-2 py-1 text-sm font-bold text-white"
        aria-label={t("outOf", { rating: rating.toFixed(1) })}
      >
        {rating.toFixed(1)}
      </span>
    </div>
  );
}
