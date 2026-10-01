import { useTranslations } from "next-intl";
import { TONES } from "@/components/booking/status-badge";
import { tripStatusTone, type TripStatus } from "@/lib/cabs/ui";
import { cn } from "@/lib/utils";

/** Where a cab trip stands (driver to be assigned, on the way, …). */
export function TripStatusBadge({ status, className }: { status: TripStatus; className?: string }) {
  const t = useTranslations("cabs.tripStatus");
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONES[tripStatusTone(status)],
        className,
      )}
    >
      {t(status)}
    </span>
  );
}
