import { Badge } from "@/components/ui/badge";
import { statusTone, type BookingStatus } from "@/lib/bookings/state";
import { cn } from "@/lib/utils";

export type Tone = ReturnType<typeof statusTone>;

const TONE_CLASS: Record<Tone, string> = {
  success: "border-transparent bg-accent-green/15 text-accent-green",
  warning: "border-transparent bg-accent-amber/15 text-accent-amber",
  danger: "border-transparent bg-destructive/15 text-destructive",
  info: "border-transparent bg-primary/15 text-primary",
  muted: "border-transparent bg-muted text-muted-foreground",
};

/** A coloured status pill; the caller translates the label. */
export function ToneBadge({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn(TONE_CLASS[tone], className)}>
      {label}
    </Badge>
  );
}

export function BookingStatusBadge({ status, label }: { status: BookingStatus; label: string }) {
  return <ToneBadge tone={statusTone(status)} label={label} />;
}

/** Tone for payment, refund and notification states. */
export function stateTone(state: string): Tone {
  switch (state) {
    case "captured":
    case "processed":
    case "sent":
      return "success";
    case "created":
    case "authorized":
    case "pending":
      return "warning";
    case "failed":
      return "danger";
    case "refunded":
    case "partially_refunded":
      return "info";
    default:
      return "muted";
  }
}
