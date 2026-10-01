"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePathname, useRouter } from "@/i18n/navigation";
import { FILTER_KEYS, queryString, toggleListValue, withParams } from "@/lib/hotels/url";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

export type FilterOptions = {
  priceBuckets: [number, number | null][];
  propertyTypes: FilterOption[];
  amenities: FilterOption[];
  landmarks: FilterOption[];
  radii: number[];
};

const RATINGS = ["4.5", "4", "3.5", "3"];
const STARS = ["5", "4", "3", "2", "1", "0"];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-1 border-b pb-4 last:border-0">
      <legend className="mb-2 text-sm font-semibold text-heading">{title}</legend>
      {children}
    </fieldset>
  );
}

function Check({
  id,
  label,
  checked,
  onChange,
  type = "checkbox",
  name,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
  type?: "checkbox" | "radio";
  name?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-1 text-sm hover:bg-muted/50"
    >
      <input
        id={id}
        name={name}
        type={type}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-[var(--color-primary)]"
      />
      {label}
    </label>
  );
}

function FilterPanel({ query, options }: { query: Record<string, string>; options: FilterOptions }) {
  const t = useTranslations("hotels.filters");
  const tType = useTranslations("hotels.propertyTypes");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const apply = (changes: Record<string, string | number | null>) =>
    startTransition(() =>
      router.replace(`${pathname}${queryString(withParams(query, changes))}`, { scroll: false }),
    );
  const toggle = (key: string, value: string) => apply({ [key]: toggleListValue(query[key], value) });
  const list = (key: string) => (query[key] ?? "").split(",").filter(Boolean);
  const flag = (key: string) => query[key] === "1" || query[key] === "true";

  const bucketActive = (min: number, max: number | null) =>
    query.price_min === String(min / 100) &&
    (max === null ? !query.price_max : query.price_max === String(max / 100));

  const onCustomPrice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const read = (k: string) => {
      const v = data.get(k);
      return typeof v === "string" && /^\d+$/.test(v.trim()) ? v.trim() : null;
    };
    apply({ price_min: read("price_min"), price_max: read("price_max") });
  };

  const active = FILTER_KEYS.some((k) => query[k]);

  return (
    <div className={cn("grid gap-4", pending && "opacity-70")} aria-busy={pending}>
      <div className="flex items-center justify-between">
        <p className="font-semibold">{t("title")}</p>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => apply(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
          >
            <X /> {t("clear")}
          </Button>
        ) : null}
      </div>

      <Group title={t("price")}>
        {options.priceBuckets.map(([min, max]) => {
          const label =
            max === null
              ? t("priceAbove", { min: formatPaise(min, locale) })
              : min === 0
                ? t("priceUpTo", { max: formatPaise(max, locale) })
                : `${formatPaise(min, locale)} – ${formatPaise(max, locale)}`;
          const on = bucketActive(min, max);
          return (
            <Check
              key={`${min}-${max}`}
              id={`price-${min}`}
              label={label}
              checked={on}
              onChange={() =>
                apply(
                  on
                    ? { price_min: null, price_max: null }
                    : { price_min: min / 100, price_max: max === null ? null : max / 100 },
                )
              }
            />
          );
        })}
        <form onSubmit={onCustomPrice} className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="price-min" className="text-xs text-muted-foreground">
              {t("min")}
            </Label>
            <Input
              id="price-min"
              name="price_min"
              inputMode="numeric"
              defaultValue={query.price_min ?? ""}
              placeholder="₹"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="price-max" className="text-xs text-muted-foreground">
              {t("max")}
            </Label>
            <Input
              id="price-max"
              name="price_max"
              inputMode="numeric"
              defaultValue={query.price_max ?? ""}
              placeholder="₹"
            />
          </div>
          <Button type="submit" variant="outline">
            {t("go")}
          </Button>
        </form>
      </Group>

      <Group title={t("stars")}>
        {STARS.map((s) => (
          <Check
            key={s}
            id={`stars-${s}`}
            label={s === "0" ? t("unrated") : t("starCount", { count: Number(s) })}
            checked={list("stars").includes(s)}
            onChange={() => toggle("stars", s)}
          />
        ))}
      </Group>

      <Group title={t("rating")}>
        {RATINGS.map((r) => (
          <Check
            key={r}
            id={`rating-${r}`}
            type="radio"
            name="rating"
            label={t("ratingAtLeast", { rating: r })}
            checked={query.rating === r}
            onChange={() => apply({ rating: query.rating === r ? null : r })}
          />
        ))}
      </Group>

      <Group title={t("popular")}>
        <Check
          id="f-breakfast"
          label={t("breakfast")}
          checked={flag("breakfast")}
          onChange={() => apply({ breakfast: flag("breakfast") ? null : 1 })}
        />
        <Check
          id="f-couple"
          label={t("couple")}
          checked={flag("couple")}
          onChange={() => apply({ couple: flag("couple") ? null : 1 })}
        />
        <Check
          id="f-free-cancel"
          label={t("freeCancellation")}
          checked={flag("free_cancel")}
          onChange={() => apply({ free_cancel: flag("free_cancel") ? null : 1 })}
        />
      </Group>

      {options.landmarks.length ? (
        <Group title={t("distance")}>
          <div className="grid gap-2">
            <Label htmlFor="f-landmark" className="text-xs text-muted-foreground">
              {t("from")}
            </Label>
            <NativeSelect
              id="f-landmark"
              value={query.landmark ?? ""}
              onChange={(e) =>
                apply({
                  landmark: e.target.value || null,
                  within: e.target.value ? (query.within ?? null) : null,
                })
              }
            >
              <option value="">{t("anyLandmark")}</option>
              {options.landmarks.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
            {query.landmark ? (
              <div className="flex flex-wrap gap-2">
                {options.radii.map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={query.within === String(m) ? "default" : "outline"}
                    aria-pressed={query.within === String(m)}
                    onClick={() => apply({ within: query.within === String(m) ? null : m })}
                  >
                    {m < 1000 ? t("withinM", { m }) : t("withinKm", { km: m / 1000 })}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        </Group>
      ) : null}

      <Group title={t("propertyType")}>
        {options.propertyTypes.map((o) => (
          <Check
            key={o.value}
            id={`type-${o.value}`}
            label={tType(o.value)}
            checked={list("type").includes(o.value)}
            onChange={() => toggle("type", o.value)}
          />
        ))}
      </Group>

      {options.amenities.length ? (
        <Group title={t("amenities")}>
          {options.amenities.map((o) => (
            <Check
              key={o.value}
              id={`amenity-${o.value}`}
              label={o.label}
              checked={list("amenities").includes(o.value)}
              onChange={() => toggle("amenities", o.value)}
            />
          ))}
        </Group>
      ) : null}
    </div>
  );
}

/** Sidebar on large screens; a "Filters" button opening a drawer on phones. */
export function HotelFilters({
  query,
  options,
  activeCount,
}: {
  query: Record<string, string>;
  options: FilterOptions;
  activeCount: number;
}) {
  const t = useTranslations("hotels.filters");
  return (
    <>
      <aside className="hidden lg:block">
        <div className="sticky top-20 rounded-2xl border bg-card p-4">
          <FilterPanel query={query} options={options} />
        </div>
      </aside>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="lg:hidden">
            <SlidersHorizontal /> {t("title")}
            {activeCount ? (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                {activeCount}
              </span>
            ) : null}
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="overflow-y-auto p-4">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("title")}</SheetTitle>
          </SheetHeader>
          <FilterPanel query={query} options={options} />
        </SheetContent>
      </Sheet>
    </>
  );
}
