"use client";

import { ArrowLeftRight, Loader2, LocateFixed, Search, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { toQueryString } from "@/lib/cabs/ui";
import { getIcon } from "@/lib/icons";
import type { RideSearchOptions } from "@/lib/rides/page-data";
import { geoProblem, hourOptions, rideSearchQuery, roundCoord, type GeoProblem } from "@/lib/rides/ui";
import { cn } from "@/lib/utils";
import type { RideMode, RideSearch } from "@/schemas/rides";
import { RidePlacePicker } from "./ride-place-picker";

type Missing = "from" | "to" | "same" | "at";
type Coords = { lat: number; lng: number };
type End = "from" | "to";

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

function Pill({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        checked ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-accent",
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

const inputClass =
  "h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base font-semibold shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:text-sm";

/**
 * Local ride search: vehicle, point-to-point or by the hour, pickup and
 * drop (a landmark or the rider's own location), now or later, and how
 * many people. Submitting writes the search into the URL; the page prices
 * it on the server.
 */
export function RideSearchForm({
  options,
  initial,
  className,
}: {
  options: RideSearchOptions;
  initial?: Partial<RideSearch>;
  className?: string;
}) {
  const t = useTranslations("rides.search");
  const router = useRouter();
  const [v, setV] = useState<string | undefined>(
    options.types.some((x) => x.key === initial?.v) ? initial?.v : options.types[0]?.key,
  );
  const [mode, setMode] = useState<RideMode>(initial?.mode ?? "point_to_point");
  const [from, setFrom] = useState(initial?.from);
  const [to, setTo] = useState(initial?.to);
  const [fromAt, setFromAt] = useState<Coords | null>(
    initial?.flat !== undefined && initial?.flng !== undefined
      ? { lat: initial.flat, lng: initial.flng }
      : null,
  );
  const [toAt, setToAt] = useState<Coords | null>(
    initial?.tlat !== undefined && initial?.tlng !== undefined
      ? { lat: initial.tlat, lng: initial.tlng }
      : null,
  );
  const [hrs, setHrs] = useState(Math.min(initial?.hrs ?? 2, options.maxHours));
  const [later, setLater] = useState(Boolean(initial?.at && initial.at !== "now"));
  const [at, setAt] = useState(initial?.at && initial.at !== "now" ? initial.at : options.defaultAt);
  const [pax, setPax] = useState(initial?.pax ?? 1);
  const [missing, setMissing] = useState<Missing | null>(null);
  const [locating, setLocating] = useState<End | null>(null);
  const [geo, setGeo] = useState<{ end: End; problem: GeoProblem } | null>(null);

  const chosen = options.types.find((x) => x.key === v);
  const paxMax = Math.max(1, options.maxPassengers, pax);

  const pick = (end: End) => (slug: string | undefined) => {
    setMissing(null);
    if (end === "from") {
      setFrom(slug);
      if (slug !== "here") setFromAt(null);
    } else {
      setTo(slug);
      if (slug !== "here") setToAt(null);
    }
  };

  const locate = (end: End) => {
    setGeo(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeo({ end, problem: geoProblem("unsupported") });
      return;
    }
    setLocating(end);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: roundCoord(pos.coords.latitude), lng: roundCoord(pos.coords.longitude) };
        setLocating(null);
        setMissing(null);
        if (end === "from") {
          setFrom("here");
          setFromAt(coords);
        } else {
          setTo("here");
          setToAt(coords);
        }
      },
      (error) => {
        setLocating(null);
        setGeo({ end, problem: geoProblem(error.code) });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    setFromAt(toAt);
    setToAt(fromAt);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hereOk = (slug: string | undefined, coords: Coords | null) =>
      Boolean(slug) && (slug !== "here" || coords !== null);
    const problem: Missing | null = !hereOk(from, fromAt)
      ? "from"
      : mode === "point_to_point" && !hereOk(to, toAt)
        ? "to"
        : mode === "point_to_point" && from === to && from !== "here"
          ? "same"
          : later && !at
            ? "at"
            : null;
    setMissing(problem);
    if (problem) return;
    const query = rideSearchQuery({
      v,
      mode,
      from,
      flat: fromAt?.lat,
      flng: fromAt?.lng,
      to,
      tlat: toAt?.lat,
      tlng: toAt?.lng,
      hrs,
      at: later ? at : "now",
      pax,
    });
    router.push(`/rides${toQueryString(query)}#results`);
  };

  const locateButton = (end: End) => (
    <button
      type="button"
      onClick={() => locate(end)}
      disabled={locating !== null}
      className="inline-flex min-h-10 items-center gap-1.5 justify-self-start rounded-full px-1 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
    >
      {locating === end ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <LocateFixed className="size-4" aria-hidden="true" />
      )}
      {locating === end ? t("locating") : t(end === "from" ? "useMyLocation" : "dropMyLocation")}
    </button>
  );

  return (
    <div className={cn("rounded-2xl border bg-card p-3 shadow-lg sm:p-5", className)}>
      <form onSubmit={onSubmit} noValidate role="search" aria-label={t("label")} className="space-y-5">
        {options.types.length ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("vehicle")}
            </legend>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {options.types.map((type) => {
                const Icon = getIcon(type.icon);
                const on = v === type.key;
                return (
                  <label
                    key={type.key}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                      on ? "border-primary bg-primary/10 ring-1 ring-primary" : "bg-card hover:bg-accent",
                    )}
                  >
                    <input
                      type="radio"
                      name="vehicle"
                      value={type.key}
                      className="sr-only"
                      checked={on}
                      onChange={() => setV(type.key)}
                    />
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full",
                        on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block leading-tight font-bold">{type.name}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3" aria-hidden="true" /> {t("seats", { count: type.seats })}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {chosen ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {chosen.description}
                {!chosen.instantBook ? (
                  <span className="block font-medium text-accent-orange">{t("onRequest")}</span>
                ) : null}
              </p>
            ) : null}
          </fieldset>
        ) : (
          <p className="rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">{t("noVehicles")}</p>
        )}

        <div role="radiogroup" aria-label={t("modeLabel")} className="flex flex-wrap gap-2">
          <Pill
            name="mode"
            checked={mode === "point_to_point"}
            onChange={() => {
              setMode("point_to_point");
              setMissing(null);
            }}
          >
            {t("modes.point_to_point")}
          </Pill>
          <Pill
            name="mode"
            checked={mode === "hourly"}
            onChange={() => {
              setMode("hourly");
              setMissing(null);
            }}
          >
            {t("modes.hourly")}
          </Pill>
        </div>

        <div
          className={cn(
            "grid gap-3",
            mode === "point_to_point"
              ? "sm:grid-cols-[1fr_auto_1fr] sm:items-start"
              : "sm:grid-cols-[1fr_10rem]",
          )}
        >
          <div className="grid gap-1">
            <Field label={t("from")} htmlFor="ride-from">
              <RidePlacePicker
                id="ride-from"
                label={t("from")}
                value={from}
                onChange={pick("from")}
                points={options.points}
                zones={options.zones}
                placeholder={t("fromPlaceholder")}
                invalid={missing === "from" || missing === "same"}
              />
            </Field>
            {locateButton("from")}
          </div>
          {mode === "point_to_point" ? (
            <>
              <button
                type="button"
                onClick={swap}
                aria-label={t("swap")}
                className="-my-2 grid size-10 place-items-center justify-self-end rounded-full border bg-card text-primary shadow-sm hover:bg-accent sm:my-0 sm:mt-7 sm:justify-self-center"
              >
                <ArrowLeftRight className="size-4 rotate-90 sm:rotate-0" aria-hidden="true" />
              </button>
              <div className="grid gap-1">
                <Field label={t("to")} htmlFor="ride-to">
                  <RidePlacePicker
                    id="ride-to"
                    label={t("to")}
                    value={to}
                    onChange={pick("to")}
                    points={options.points}
                    zones={options.zones}
                    placeholder={t("toPlaceholder")}
                    invalid={missing === "to" || missing === "same"}
                  />
                </Field>
                {locateButton("to")}
              </div>
            </>
          ) : (
            <Field label={t("hours")} htmlFor="ride-hrs">
              <NativeSelect
                id="ride-hrs"
                className="h-12 font-semibold"
                value={hrs}
                onChange={(e) => setHrs(Number(e.target.value))}
              >
                {hourOptions(options.maxHours).map((n) => (
                  <option key={n} value={n}>
                    {t("hoursOption", { count: n })}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>

        <p aria-live="polite" className="text-sm empty:hidden">
          {geo ? (
            <span className="block rounded-xl bg-accent-orange/10 p-3 text-foreground">
              {t(`geo.${geo.problem}`)}
            </span>
          ) : null}
        </p>

        <div className="grid gap-3 sm:grid-cols-[1fr_8rem] sm:items-end">
          <div className="space-y-2">
            <div role="radiogroup" aria-label={t("when")} className="flex flex-wrap gap-2">
              <Pill name="when" checked={!later} onChange={() => setLater(false)}>
                {t("now")}
              </Pill>
              <Pill name="when" checked={later} onChange={() => setLater(true)}>
                {t("schedule")}
              </Pill>
            </div>
            {later ? (
              <Field label={t("pickupAt")} htmlFor="ride-at">
                <input
                  id="ride-at"
                  type="datetime-local"
                  className={cn(inputClass, missing === "at" && "border-destructive")}
                  min={options.minAt}
                  max={options.maxAt}
                  step={300}
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  aria-describedby="ride-ist"
                />
              </Field>
            ) : (
              <p className="text-sm text-muted-foreground">{t("nowHint")}</p>
            )}
          </div>
          <Field label={t("passengers")} htmlFor="ride-pax">
            <NativeSelect
              id="ride-pax"
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
        {later ? (
          <p id="ride-ist" className="-mt-3 text-xs text-muted-foreground">
            {t("istNote")}
          </p>
        ) : null}

        {missing ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {t(`missing.${missing}`)}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="h-12 w-full text-base sm:w-auto sm:min-w-48">
          <Search /> {t("submit")}
        </Button>
      </form>
    </div>
  );
}
