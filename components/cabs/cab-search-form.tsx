"use client";

import { ArrowLeftRight, Clock, Landmark, Plane, Route, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "@/i18n/navigation";
import {
  cabSearchQuery,
  splitMinutes,
  tabForType,
  toQueryString,
  type CabTab,
  type PlaceOption,
} from "@/lib/cabs/ui";
import { addDays } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CabSearch, CabTripType } from "@/schemas/cabs";
import { PlacePicker } from "./place-picker";

export type CabSearchOptions = {
  places: PlaceOption[];
  packages: { key: string; name: string }[];
  tours: {
    slug: string;
    name: string;
    stops: string[];
    durationMinutes: number;
    distanceKm: number;
    fromPaise: number | null;
  }[];
  /** [from, to] place slugs that have a transfer route. */
  transferPairs: [string, string][];
  maxPassengers: number;
  minAt: string;
  maxAt: string;
  defaultAt: string;
};

const TAB_ICON = { outstation: Route, local: Clock, transfer: Plane, sightseeing: Landmark } as const;

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
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

const inputClass =
  "h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base font-semibold shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:text-sm";

type Missing = "from" | "to" | "pkg" | "route" | "at" | "back" | "same";

/**
 * Cab search widget. Each tab sets the trip type; submitting writes the
 * search into the URL of the results page, which prices it on the server.
 */
export function CabSearchForm({
  options,
  initial,
  locale,
  className,
}: {
  options: CabSearchOptions;
  initial?: Partial<CabSearch>;
  locale: string;
  className?: string;
}) {
  const t = useTranslations("cabs.search");
  const router = useRouter();
  const [tab, setTab] = useState<CabTab>(tabForType(initial?.type ?? "one_way"));
  const [roundTrip, setRoundTrip] = useState(initial?.type === "round_trip");
  const [from, setFrom] = useState(initial?.from);
  const [to, setTo] = useState(initial?.to);
  const [pkg, setPkg] = useState(initial?.pkg ?? options.packages[0]?.key);
  const [route, setRoute] = useState(initial?.route ?? options.tours[0]?.slug);
  const [at, setAt] = useState(initial?.at ?? options.defaultAt);
  const [back, setBack] = useState(initial?.back ?? "");
  const [pax, setPax] = useState(initial?.pax ?? 2);
  const [missing, setMissing] = useState<Missing | null>(null);

  const transferFrom = options.places.filter((p) => options.transferPairs.some(([f]) => f === p.slug));
  const transferTo = options.places.filter((p) =>
    options.transferPairs.some(([f, d]) => d === p.slug && (!from || f === from)),
  );

  const type: CabTripType = tab === "outstation" ? (roundTrip ? "round_trip" : "one_way") : tab;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const check: Missing | null =
      tab === "sightseeing"
        ? !route
          ? "route"
          : null
        : tab === "local"
          ? !from
            ? "from"
            : !pkg
              ? "pkg"
              : null
          : !from
            ? "from"
            : !to
              ? "to"
              : from === to
                ? "same"
                : null;
    const problem = check ?? (!at ? "at" : type === "round_trip" && !back ? "back" : null);
    setMissing(problem);
    if (problem) return;
    const query = cabSearchQuery({ type, from, to, pkg, route, at, back: back || undefined, pax });
    router.push(`/cabs/search${toQueryString(query)}`);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const toggleRound = (on: boolean) => {
    setRoundTrip(on);
    if (on && !back && at) setBack(`${addDays(at.slice(0, 10), 1)}T18:00`);
  };

  const fromToFields = (places: PlaceOption[], toPlaces: PlaceOption[], canSwap: boolean) => (
    <div
      className={cn("grid gap-3", canSwap ? "sm:grid-cols-[1fr_auto_1fr] sm:items-end" : "sm:grid-cols-2")}
    >
      <Field label={t("from")} htmlFor={`cab-${tab}-from`}>
        <PlacePicker
          id={`cab-${tab}-from`}
          label={t("from")}
          value={from}
          onChange={(v) => {
            setFrom(v);
            setMissing(null);
          }}
          options={places}
          placeholder={t("fromPlaceholder")}
          invalid={missing === "from" || missing === "same"}
        />
      </Field>
      {canSwap ? (
        <button
          type="button"
          onClick={swap}
          aria-label={t("swap")}
          className="-my-2 grid size-10 place-items-center justify-self-end rounded-full border bg-card text-primary shadow-sm hover:bg-accent sm:my-0 sm:mb-1 sm:justify-self-center"
        >
          <ArrowLeftRight className="size-4 rotate-90 sm:rotate-0" aria-hidden="true" />
        </button>
      ) : null}
      <Field label={t("to")} htmlFor={`cab-${tab}-to`}>
        <PlacePicker
          id={`cab-${tab}-to`}
          label={t("to")}
          value={to}
          onChange={(v) => {
            setTo(v);
            setMissing(null);
          }}
          options={toPlaces}
          placeholder={t("toPlaceholder")}
          invalid={missing === "to" || missing === "same"}
        />
      </Field>
    </div>
  );

  const paxMax = Math.max(1, options.maxPassengers, pax);

  return (
    <div className={cn("rounded-2xl border bg-card p-3 shadow-lg sm:p-5", className)}>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as CabTab);
          setMissing(null);
        }}
      >
        <TabsList
          aria-label={t("tabsLabel")}
          className="grid h-auto w-full grid-cols-4 gap-1 bg-transparent p-0"
        >
          {(Object.keys(TAB_ICON) as CabTab[]).map((key) => {
            const Icon = TAB_ICON[key];
            return (
              <TabsTrigger
                key={key}
                value={key}
                className="min-h-14 flex-col gap-1 px-1 text-xs whitespace-normal data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground sm:flex-row sm:px-3 sm:text-sm"
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {t(`tabs.${key}`)}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <form onSubmit={onSubmit} noValidate role="search" aria-label={t("label")} className="space-y-4">
          <TabsContent value="outstation" className="space-y-3">
            <div role="radiogroup" aria-label={t("tripKind")} className="flex gap-2">
              {[false, true].map((on) => (
                <label
                  key={String(on)}
                  className={cn(
                    "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium",
                    roundTrip === on ? "border-primary bg-primary/10 text-primary" : "bg-card",
                  )}
                >
                  <input
                    type="radio"
                    name="tripKind"
                    className="sr-only"
                    checked={roundTrip === on}
                    onChange={() => toggleRound(on)}
                  />
                  {on ? t("roundTrip") : t("oneWay")}
                </label>
              ))}
            </div>
            {fromToFields(options.places, options.places, true)}
          </TabsContent>

          <TabsContent value="local" className="space-y-3">
            <Field label={t("city")} htmlFor="cab-local-from">
              <PlacePicker
                id="cab-local-from"
                label={t("city")}
                value={from}
                onChange={(v) => {
                  setFrom(v);
                  setMissing(null);
                }}
                options={options.places}
                placeholder={t("cityPlaceholder")}
                invalid={missing === "from"}
              />
            </Field>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("package")}
              </legend>
              {options.packages.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {options.packages.map((p) => (
                    <label
                      key={p.key}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold",
                        pkg === p.key ? "border-primary bg-primary/10 text-primary" : "bg-card",
                      )}
                    >
                      <input
                        type="radio"
                        name="pkg"
                        className="sr-only"
                        checked={pkg === p.key}
                        onChange={() => setPkg(p.key)}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noPackages")}</p>
              )}
            </fieldset>
          </TabsContent>

          <TabsContent value="transfer" className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("transferHint")}</p>
            {fromToFields(transferFrom, transferTo, false)}
          </TabsContent>

          <TabsContent value="sightseeing" className="space-y-3">
            {options.tours.length ? (
              <div role="radiogroup" aria-label={t("tour")} className="grid gap-2 sm:grid-cols-2">
                {options.tours.map((tour) => {
                  const d = splitMinutes(tour.durationMinutes);
                  return (
                    <label
                      key={tour.slug}
                      className={cn(
                        "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm",
                        route === tour.slug ? "border-primary ring-1 ring-primary" : "bg-card",
                      )}
                    >
                      <input
                        type="radio"
                        name="route"
                        className="sr-only"
                        checked={route === tour.slug}
                        onChange={() => setRoute(tour.slug)}
                      />
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-bold">{tour.name}</span>
                        {tour.fromPaise !== null ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t("fromPrice", { price: formatPaise(tour.fromPaise, locale) })}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("tourMeta", { hours: d.hours, minutes: d.minutes, km: tour.distanceKm })}
                      </span>
                      {tour.stops.length ? <span className="text-xs">{tour.stops.join(" · ")}</span> : null}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noTours")}</p>
            )}
          </TabsContent>

          <div
            className={cn(
              "grid gap-3",
              type === "round_trip" ? "sm:grid-cols-[1fr_1fr_8rem]" : "sm:grid-cols-[1fr_8rem]",
            )}
          >
            <Field label={t("pickup")} htmlFor="cab-at">
              <input
                id="cab-at"
                type="datetime-local"
                className={cn(inputClass, missing === "at" && "border-destructive")}
                min={options.minAt}
                max={options.maxAt}
                step={900}
                value={at}
                onChange={(e) => setAt(e.target.value)}
                aria-describedby="cab-ist"
              />
            </Field>
            {type === "round_trip" ? (
              <Field label={t("return")} htmlFor="cab-back">
                <input
                  id="cab-back"
                  type="datetime-local"
                  className={cn(inputClass, missing === "back" && "border-destructive")}
                  min={at || options.minAt}
                  step={900}
                  value={back}
                  onChange={(e) => setBack(e.target.value)}
                  aria-describedby="cab-ist"
                />
              </Field>
            ) : null}
            <Field label={t("passengers")} htmlFor="cab-pax">
              <NativeSelect
                id="cab-pax"
                className="h-12 font-semibold"
                value={pax}
                onChange={(e) => setPax(Number(e.target.value))}
              >
                {Array.from({ length: paxMax }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <p id="cab-ist" className="-mt-2 text-xs text-muted-foreground">
            {t("istNote")}
          </p>

          {missing ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {t(`missing.${missing}`)}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="h-12 w-full text-base sm:w-auto sm:min-w-48">
            <Search /> {t("submit")}
          </Button>
        </form>
      </Tabs>
    </div>
  );
}
