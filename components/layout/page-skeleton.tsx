import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Placeholder shown by the route `loading.tsx` files the moment a link is
 * clicked, while the next page renders on the server. It also lets Next
 * prefetch dynamic pages up to this point, so the click responds at once
 * instead of waiting for the full page (D-105).
 */
export function PageSkeleton({
  variant = "list",
  className,
}: {
  variant?: "list" | "grid";
  className?: string;
}) {
  const t = useTranslations("common");
  return (
    <div role="status" aria-live="polite" className={cn("w-full space-y-6", className)}>
      <span className="sr-only">{t("loading")}</span>
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-1/2 max-w-sm" />
      </div>
      {variant === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[4/3] w-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
