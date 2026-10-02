"use client";

import {
  Building,
  Hotel,
  Landmark,
  LocateFixed,
  MapPin,
  ShoppingBag,
  TrainFront,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  groupRidePoints,
  type RidePointKind,
  type RidePointOption,
  type RideZoneOption,
} from "@/lib/rides/ui";
import { cn } from "@/lib/utils";

export const POINT_ICON: Record<RidePointKind, LucideIcon> = {
  temple: Landmark,
  ghat: Waves,
  station: TrainFront,
  market: ShoppingBag,
  hotel: Hotel,
  landmark: MapPin,
};

/**
 * Searchable landmark picker (ARIA combobox) grouped by town, popular
 * landmarks first. The value "here" means the rider's own location, which
 * the form sets from the browser; it shows as "My location".
 */
export function RidePlacePicker({
  id,
  label,
  value,
  onChange,
  points,
  zones,
  placeholder,
  invalid,
  describedBy,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (slug: string | undefined) => void;
  points: readonly RidePointOption[];
  zones: readonly RideZoneOption[];
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("rides.search");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = points.find((o) => o.slug === value);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);

  const groups = useMemo(() => groupRidePoints(points, zones, term), [points, zones, term]);
  const flat = groups.flatMap((g) => g.points);
  const optionId = (slug: string) => `${listId}-${slug}`;
  const shown = value === "here" ? t("myLocation") : (selected?.name ?? "");

  const choose = (point: RidePointOption) => {
    onChange(point.slug);
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
      const point = flat[active];
      if (point) choose(point);
    } else if (event.key === "Escape") {
      setOpen(false);
      setTerm("");
    }
  };

  const Icon = value === "here" ? LocateFixed : selected ? POINT_ICON[selected.kind] : Building;

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
          aria-describedby={describedBy}
          aria-activedescendant={open && flat[active] ? optionId(flat[active].slug) : undefined}
          autoComplete="off"
          placeholder={placeholder ?? t("placePlaceholder")}
          value={open ? term : shown}
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
        {value && !open ? (
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
            groups.map((g) => {
              const groupLabel = g.label ?? t("popular");
              return (
                <div key={g.key} role="group" aria-label={groupLabel}>
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {groupLabel}
                  </p>
                  {g.points.map((point) => {
                    const index = flat.indexOf(point);
                    const KindIcon = POINT_ICON[point.kind] ?? MapPin;
                    return (
                      <div
                        key={point.slug}
                        id={optionId(point.slug)}
                        role="option"
                        aria-selected={point.slug === value}
                        // Keep focus in the input so blur doesn't close the list before the click lands.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(point)}
                        onMouseEnter={() => setActive(index)}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm",
                          index === active && "bg-accent text-accent-foreground",
                          point.slug === value && "font-semibold",
                        )}
                      >
                        <KindIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{point.name}</span>
                        {g.key === "popular" ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {zones.find((z) => z.slug === point.zone)?.name}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
