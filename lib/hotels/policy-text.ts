import type { CancellationRule } from "@/lib/availability/engine";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** One-line cancellation summary; `t` resolves `cancellation.*` keys. */
export function cancellationText(rules: readonly CancellationRule[], refundable: boolean, t: Translate): string {
  if (!refundable || rules.length === 0) return t("cancellation.nonRefundable");
  const full = rules
    .filter((r) => r.refund_percent >= 100)
    .sort((a, b) => a.hours_before - b.hours_before)[0];
  if (full) return t("cancellation.free", { hours: full.hours_before });
  const best = [...rules].sort((a, b) => b.refund_percent - a.refund_percent)[0];
  return t("cancellation.partial", { percent: best.refund_percent, hours: best.hours_before });
}
