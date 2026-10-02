import { PauseCircle } from "lucide-react";
import { useTranslations } from "next-intl";

/** Shown while online ordering for a shop is switched off (feature flag): browsing still works. */
export function OrderingPaused({ shop }: { shop: "food" | "essentials" | "medicine" }) {
  const t = useTranslations("shop.paused");
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-2xl border border-accent-orange/40 bg-accent-orange/10 p-4 text-sm"
    >
      <PauseCircle className="size-5 shrink-0 text-accent-orange" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">{t(`${shop}.title`)}</p>
        <p>{t(`${shop}.body`)}</p>
      </div>
    </div>
  );
}
