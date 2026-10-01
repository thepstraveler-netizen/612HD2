import { useTranslations } from "next-intl";
import { statusTone, type BookingStatus } from "@/lib/bookings/state";
import { cn } from "@/lib/utils";

export const TONES = {
  success: "bg-accent-green/15 text-accent-green",
  warning: "bg-accent-orange/15 text-accent-orange",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-primary/10 text-primary",
  muted: "bg-secondary text-secondary-foreground",
} as const;

export function BookingStatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const t = useTranslations("trips.status");
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONES[statusTone(status)],
        className,
      )}
    >
      {t(status)}
    </span>
  );
}
