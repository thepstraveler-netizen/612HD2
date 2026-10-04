"use client";

import { Pencil, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { addDays, isIsoDate } from "@/lib/dates";
import { queryString, withParams } from "@/lib/hotels/url";
import { cn } from "@/lib/utils";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * Phone summary of the current search ("Vrindavan · 12 Oct – 14 Oct · 2 guests");
 * tapping it opens the full form, so results start on the first screen.
 */
function SearchSummary({
  query,
  placeholder,
  controls,
  onEdit,
}: {
  query: Record<string, string>;
  placeholder?: string;
  controls: string;
  onEdit: () => void;
}) {
  const t = useTranslations("hotels.search");
  const format = useFormatter();
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" });
  const checkin = query.checkin ?? "";
  const checkout = query.checkout ?? "";
  const dates =
    isIsoDate(checkin) && isIsoDate(checkout) ? `${day(checkin)} – ${day(checkout)}` : t("addDates");
  const guests = (Number(query.adults) || 2) + (Number(query.children) || 0);
  const rooms = Number(query.rooms) || 1;

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-expanded={false}
      aria-controls={controls}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card py-2 ps-4 pe-2 text-start shadow-sm transition focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
    >
      <Search className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-semibold text-heading">
          {query.q || placeholder || t("destination")}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {dates} · {t("summaryRooms", { count: rooms })} · {t("summaryGuests", { count: guests })}
        </span>
      </span>
      <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-semibold text-secondary-foreground">
        <Pencil className="size-3.5" aria-hidden="true" />
        {t("edit")}
      </span>
    </button>
  );
}

/**
 * Destination, dates, rooms and guests. Submitting rewrites only these keys
 * of the current query, so filters chosen on the listing survive a date change.
 * `collapsible`: below md the form starts folded into a one-line summary.
 */
export function HotelSearchBar({
  pathname,
  query,
  today,
  maxRooms,
  showDestination = true,
  placeholder,
  collapsible = false,
  className,
}: {
  pathname: string;
  query: Record<string, string>;
  today: string;
  maxRooms: number;
  showDestination?: boolean;
  placeholder?: string;
  collapsible?: boolean;
  className?: string;
}) {
  const t = useTranslations("hotels.search");
  const router = useRouter();
  const [checkin, setCheckin] = useState(query.checkin ?? "");
  const [expanded, setExpanded] = useState(false);
  const formId = useId();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => {
      const v = data.get(key);
      return typeof v === "string" ? v.trim() : "";
    };
    const changes: Record<string, string | null> = {
      checkin: value("checkin") || null,
      checkout: value("checkout") || null,
      rooms: value("rooms") || null,
      adults: value("adults") || null,
      children: value("children") === "0" ? null : value("children") || null,
    };
    if (showDestination) changes.q = value("q") || null;
    setExpanded(false);
    router.push(`${pathname}${queryString(withParams(query, changes))}`);
  };

  const minCheckout = isIsoDate(checkin) ? addDays(checkin, 1) : addDays(today, 1);

  const form = (
    <form
      id={formId}
      onSubmit={onSubmit}
      role="search"
      aria-label={t("label")}
      className={cn(
        "grid gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:grid-cols-2 sm:p-4",
        collapsible && !expanded && "max-md:hidden",
        showDestination
          ? "lg:grid-cols-[1.6fr_1fr_1fr_0.6fr_0.6fr_0.6fr_auto] lg:items-end"
          : "lg:grid-cols-[1fr_1fr_0.6fr_0.6fr_0.6fr_auto] lg:items-end",
        !collapsible && className,
      )}
    >
      {showDestination ? (
        <Field label={t("destination")} htmlFor="hs-q">
          <Input
            id="hs-q"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder={placeholder}
            autoComplete="off"
          />
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:contents">
        <Field label={t("checkIn")} htmlFor="hs-checkin">
          <Input
            id="hs-checkin"
            name="checkin"
            type="date"
            min={today}
            value={checkin}
            onChange={(e) => setCheckin(e.target.value)}
          />
        </Field>
        <Field label={t("checkOut")} htmlFor="hs-checkout">
          <Input
            id="hs-checkout"
            name="checkout"
            type="date"
            min={minCheckout}
            defaultValue={query.checkout ?? ""}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:col-span-2 lg:contents">
        <Field label={t("rooms")} htmlFor="hs-rooms">
          <Input
            id="hs-rooms"
            name="rooms"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxRooms}
            defaultValue={query.rooms ?? "1"}
          />
        </Field>
        <Field label={t("adults")} htmlFor="hs-adults">
          <Input
            id="hs-adults"
            name="adults"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            defaultValue={query.adults ?? "2"}
          />
        </Field>
        <Field label={t("children")} htmlFor="hs-children">
          <Input
            id="hs-children"
            name="children"
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            defaultValue={query.children ?? "0"}
          />
        </Field>
      </div>
      <Button type="submit" size="lg" className="w-full sm:col-span-2 lg:col-span-1 lg:w-auto">
        <Search /> {showDestination ? t("submit") : t("update")}
      </Button>
    </form>
  );

  if (!collapsible) return form;
  return (
    <div className={className}>
      {expanded ? null : (
        <div className="md:hidden">
          <SearchSummary
            query={query}
            placeholder={placeholder}
            controls={formId}
            onEdit={() => setExpanded(true)}
          />
        </div>
      )}
      {form}
    </div>
  );
}
