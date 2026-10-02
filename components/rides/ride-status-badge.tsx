import { useTranslations } from "next-intl";
import { TONES } from "@/components/booking/status-badge";
import { rideStatusTone, type RideStatus } from "@/lib/rides/ui";
import { cn } from "@/lib/utils";

/** Where a local ride stands (finding a driver, on the way, …). */
export function RideStatusBadge({ status, className }: { status: RideStatus; className?: string }) {
  const t = useTranslations("rides.status");
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONES[rideStatusTone(status)],
        className,
      )}
    >
      {t(status)}
    </span>
  );
}
