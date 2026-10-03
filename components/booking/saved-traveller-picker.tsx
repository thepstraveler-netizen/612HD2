"use client";

import { UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

type Traveller = { id: string; name: string; phone: string | null };

/**
 * "Fill from saved travellers" chips for the review-booking guest form. A
 * chip fills the main guest; the names also feed a datalist that the other
 * guest inputs suggest from.
 */
export function SavedTravellerPicker({
  travellers,
  onPick,
}: {
  travellers: Traveller[];
  onPick: (traveller: Traveller) => void;
}) {
  const t = useTranslations("travellers");
  return (
    <div className="space-y-2">
      <p id="saved-travellers-label" className="text-sm font-medium">
        {t("pickTitle")} <span className="font-normal text-muted-foreground">· {t("pickHint")}</span>
      </p>
      <ul aria-labelledby="saved-travellers-label" className="flex flex-wrap gap-2">
        {travellers.map((tr) => (
          <li key={tr.id}>
            <button
              type="button"
              onClick={() => onPick(tr)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <UserRound className="size-4" aria-hidden="true" /> {tr.name}
            </button>
          </li>
        ))}
      </ul>
      <datalist id="saved-traveller-names">
        {travellers.map((tr) => (
          <option key={tr.id} value={tr.name} />
        ))}
      </datalist>
    </div>
  );
}
