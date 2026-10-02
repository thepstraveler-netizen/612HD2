import type { ReactNode } from "react";
import type { Diet } from "@/schemas/delivery";
import { cn } from "@/lib/utils";

const STYLES: Record<Exclude<Diet, "na">, { box: string; dot: string }> = {
  veg: { box: "border-accent-green", dot: "bg-accent-green rounded-full" },
  non_veg: { box: "border-destructive", dot: "bg-destructive [clip-path:polygon(50%_0,100%_100%,0_100%)]" },
  egg: { box: "border-accent-orange", dot: "bg-accent-orange rounded-full" },
};

/**
 * The square food mark: green dot = vegetarian, red triangle = non-vegetarian,
 * amber dot = contains egg. Shapes differ as well as colours, so the mark
 * reads without colour vision. Non-food items ("na") show nothing.
 */
export function DietMark({ diet, label, className }: { diet: Diet; label: string; className?: string }) {
  if (diet === "na") return null;
  const s = STYLES[diet];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid size-4 shrink-0 place-items-center rounded-[3px] border-2 bg-card",
        s.box,
        className,
      )}
    >
      <span className={cn("size-2", s.dot)} />
    </span>
  );
}

/** Small text tag (Jain, Sattvik, Bestseller, 24×7…). */
export function ShopTag({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "green" | "orange" | "primary" | "muted";
  className?: string;
}) {
  const tones = {
    green: "bg-accent-green/15 text-accent-green",
    orange: "bg-accent-orange/15 text-accent-orange",
    primary: "bg-primary/10 text-primary",
    muted: "bg-secondary text-secondary-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
