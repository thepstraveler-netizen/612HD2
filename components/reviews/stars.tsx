import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** A guest rating as five stars (filled up to `rating`); the label is read instead of the icons. */
export function Stars({
  rating,
  label,
  className,
  size = "size-4",
}: {
  rating: number;
  label: string;
  className?: string;
  size?: string;
}) {
  const filled = Math.round(rating);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            size,
            n <= filled ? "fill-accent-amber text-accent-amber" : "fill-transparent text-muted-foreground/40",
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
