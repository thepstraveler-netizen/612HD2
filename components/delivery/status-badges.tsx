import { useTranslations } from "next-intl";
import { TONES } from "@/components/booking/status-badge";
import { orderTone, prescriptionTone } from "@/lib/delivery/ui";
import { cn } from "@/lib/utils";
import type { OrderStatus, PrescriptionStatus } from "@/schemas/delivery";

const base =
  "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export function PrescriptionStatusBadge({
  status,
  className,
}: {
  status: PrescriptionStatus;
  className?: string;
}) {
  const t = useTranslations("medicine.status");
  return <span className={cn(base, TONES[prescriptionTone(status)], className)}>{t(status)}</span>;
}

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const t = useTranslations("orderTrip.status");
  return <span className={cn(base, TONES[orderTone(status)], className)}>{t(status)}</span>;
}
