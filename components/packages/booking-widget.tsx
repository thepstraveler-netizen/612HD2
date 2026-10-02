"use client";

import { ArrowRight, CalendarDays, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { formatPaise } from "@/lib/money";
import type { Departure } from "@/lib/packages/types";
import {
  departureRows,
  formatTourDate,
  PACKAGE_CHECKOUT_PATH,
  packageCheckoutQuery,
} from "@/lib/packages/ui";
import { cn } from "@/lib/utils";

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const t = useTranslations("packages.book");
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={t("decrease", { label })}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus />
        </Button>
        <output className="w-8 text-center font-bold" aria-live="polite">
          {value}
        </output>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={t("increase", { label })}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

/**
 * Pick a departure (or any date for a private tour) and the group, then go
 * to the checkout, which prices everything on the server. Departure states
 * here are a guide; the checkout re-checks seats and cut-offs.
 */
export function PackageBookingWidget({
  slug,
  locale,
  fixedDepartures,
  departures,
  today,
  bookUntilDays,
  minDate,
  limits,
}: {
  slug: string;
  locale: string;
  fixedDepartures: boolean;
  departures: Departure[];
  today: string;
  bookUntilDays: number;
  /** Private tours: earliest start date. */
  minDate: string;
  limits: { min: number; max: number };
}) {
  const t = useTranslations("packages.book");
  const router = useRouter();
  const [adults, setAdults] = useState(Math.max(1, Math.min(2, limits.max)));
  const [children, setChildren] = useState(0);
  const pax = adults + children;
  const rows = departureRows(departures, pax, today, bookUntilDays);
  const [departureId, setDepartureId] = useState<string | null>(
    () => rows.find((r) => r.state === "open")?.id ?? null,
  );
  const [date, setDate] = useState(minDate);
  const chosen = rows.find((r) => r.id === departureId && r.state === "open") ?? null;
  const tooFew = pax < limits.min;
  const ready = !tooFew && (fixedDepartures ? chosen !== null : date >= minDate);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    const query = packageCheckoutQuery({
      packageSlug: slug,
      departureId: chosen?.id,
      startDate: chosen?.startDate ?? date,
      adults,
      children,
    });
    router.push(`${PACKAGE_CHECKOUT_PATH}?${new URLSearchParams(query).toString()}`);
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-labelledby="book-title">
      <h2 id="book-title" className="text-lg font-bold">
        {t("title")}
      </h2>

      {fixedDepartures ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">{t("departure")}</legend>
          {rows.length ? (
            <ul className="grid max-h-72 gap-2 overflow-y-auto">
              {rows.map((r) => {
                const disabled = r.state !== "open";
                return (
                  <li key={r.id}>
                    <label
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm",
                        departureId === r.id && !disabled && "border-primary ring-1 ring-primary",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="departure"
                          className="size-5 accent-[var(--primary)]"
                          checked={departureId === r.id}
                          disabled={disabled}
                          onChange={() => setDepartureId(r.id)}
                        />
                        <span>
                          <span className="font-medium">{formatTourDate(r.startDate, locale)}</span>
                          {r.supplementPaise > 0 ? (
                            <span className="block text-xs text-muted-foreground">
                              {t("supplement", { amount: formatPaise(r.supplementPaise, locale) })}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-semibold",
                          r.state === "open" ? "text-accent-green" : "text-accent-orange",
                        )}
                      >
                        {r.state === "sold_out"
                          ? t("soldOut")
                          : r.state === "closed"
                            ? t("closed")
                            : r.seatsLeft !== null
                              ? t("seatsLeft", { count: r.seatsLeft })
                              : t("open")}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noDepartures")}</p>
          )}
        </fieldset>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="package-date" className="flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden="true" /> {t("startDate")}
          </Label>
          <Input
            id="package-date"
            type="date"
            min={minDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t("startDateHint", { date: formatTourDate(minDate, locale) })}
          </p>
        </div>
      )}

      <div className="space-y-2 rounded-xl border p-3">
        <Stepper
          label={t("adults")}
          value={adults}
          min={1}
          max={limits.max - children}
          onChange={setAdults}
        />
        <Stepper
          label={t("children")}
          value={children}
          min={0}
          max={limits.max - adults}
          onChange={setChildren}
        />
        <p className="text-xs text-muted-foreground">
          {tooFew ? t("minTravellers", { count: limits.min }) : t("groupHint", { max: limits.max })}
        </p>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={!ready}>
        {t("continue")} <ArrowRight />
      </Button>
      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </form>
  );
}
