"use client";

import { Building2, Landmark, MapPin, Plane, TrainFront, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { groupPlaces, type PlaceKind, type PlaceOption } from "@/lib/cabs/ui";
import { cn } from "@/lib/utils";

export const PLACE_ICON: Record<PlaceKind, LucideIcon> = {
  city: Building2,
  temple: Landmark,
  landmark: MapPin,
  station: TrainFront,
  airport: Plane,
};

/**
 * Searchable place picker (ARIA combobox). Focus shows popular places and
 * the rest grouped by kind; typing filters by name. Works the same with a
 * phone keyboard, so no separate mobile sheet is needed.
 */
export function PlacePicker({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  invalid,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (slug: string | undefined) => void;
  options: readonly PlaceOption[];
  placeholder?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("cabs.search");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.slug === value);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);

  const groups = useMemo(() => groupPlaces(options, term), [options, term]);
  const flat = groups.flatMap((g) => g.places);
  const optionId = (slug: string) => `${listId}-${slug}`;

  const choose = (place: PlaceOption) => {
    onChange(place.slug);
    setTerm("");
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (flat.length ? (i + step + flat.length) % flat.length : 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const place = flat[active];
      if (place) choose(place);
    } else if (event.key === "Escape") {
      setOpen(false);
      setTerm("");
    }
  };

  const Icon = selected ? PLACE_ICON[selected.kind] : MapPin;

  return (
    <div className="relative">
      <div className="relative">
        <Icon
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-activedescendant={open && flat[active] ? optionId(flat[active].slug) : undefined}
          autoComplete="off"
          placeholder={placeholder ?? t("placePlaceholder")}
          value={open ? term : (selected?.name ?? "")}
          onChange={(e) => {
            setTerm(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => {
            setOpen(false);
            setTerm("");
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-12 w-full rounded-xl border border-input bg-background ps-9 pe-9 text-base font-semibold shadow-xs placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:text-sm",
            invalid && "border-destructive",
          )}
        />
        {selected && !open ? (
          <button
            type="button"
            aria-label={t("clearPlace", { place: label })}
            className="absolute end-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => {
              onChange(undefined);
              inputRef.current?.focus();
            }}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {flat.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("noPlaces")}</p>
          ) : (
            groups.map((g) => (
              <div key={g.group} role="group" aria-label={t(`placeGroups.${g.group}`)}>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(`placeGroups.${g.group}`)}
                </p>
                {g.places.map((place) => {
                  const index = flat.indexOf(place);
                  const KindIcon = PLACE_ICON[place.kind];
                  return (
                    <div
                      key={place.slug}
                      id={optionId(place.slug)}
                      role="option"
                      aria-selected={place.slug === value}
                      // Keep focus in the input so blur doesn't close the list before the click lands.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(place)}
                      onMouseEnter={() => setActive(index)}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm",
                        index === active && "bg-accent text-accent-foreground",
                        place.slug === value && "font-semibold",
                      )}
                    >
                      <KindIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {place.name}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
