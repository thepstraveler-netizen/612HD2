"use client";

import { Bus, Plane, TrainFront } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnquiryForm } from "@/components/leads/enquiry-form";
import type { EnquiryFormValues } from "@/lib/packages/ui";
import { cn } from "@/lib/utils";
import { TRAVEL_MODES, type TravelMode } from "@/schemas/packages";

const ICON = { flight: Plane, train: TrainFront, bus: Bus } as const;

/**
 * Flight / train / bus switch over the shared enquiry form (one form, so
 * cities and dates survive a switch). The mode is kept in `?mode=` so
 * campaign links open the right one. When a live inventory provider exists
 * (lib/travel/provider.ts), its results slot in above the form; today
 * every search is an enquiry for the travel desk.
 */
export function TravelEnquiry({
  initialMode,
  classes,
  maxTravellers,
  minDate,
  locale,
  prefill,
}: {
  initialMode: TravelMode;
  classes: Record<TravelMode, string[]>;
  maxTravellers: number;
  minDate: string;
  locale: "en" | "hi";
  prefill: Partial<EnquiryFormValues>;
}) {
  const t = useTranslations("travel");
  const [mode, setMode] = useState<TravelMode>(initialMode);

  const choose = (next: TravelMode) => {
    setMode(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("mode", next);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // URL sync is a convenience only.
    }
  };

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label={t("modeLabel")}
        className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1 sm:inline-grid sm:w-fit"
      >
        {TRAVEL_MODES.map((m) => {
          const Icon = ICON[m];
          const on = m === mode;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => choose(m)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition",
                on
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden="true" /> {t(`modes.${m}`)}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t(`modeHints.${mode}`)}
      </p>
      {/* Live results from a future provider would render here, above the enquiry. */}
      <EnquiryForm
        target={{ kind: "travel", mode }}
        locale={locale}
        travelClasses={classes[mode]}
        minDate={minDate}
        maxTravellers={maxTravellers}
        initial={prefill}
        title={t("formTitle", { mode: t(`modes.${mode}`) })}
      />
    </div>
  );
}
