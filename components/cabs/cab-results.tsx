"use client";

import {
  Briefcase,
  Car,
  ChevronRight,
  Fuel,
  MessageCircle,
  Phone,
  ShieldCheck,
  Snowflake,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { filterOffers, type OfferFilters } from "@/lib/cabs/ui";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export type ResultOffer = {
  key: string;
  name: string;
  description: string | null;
  image: string | null;
  seats: number;
  luggage: number;
  isAc: boolean;
  models: { name: string; fuel: string; isFeatured: boolean }[];
  featured: string | null;
  totalPaise: number;
  includedKm: number;
  extraKmPaise: number;
  hours: number | null;
  extraHourPaise: number | null;
  fits: boolean;
  addons: string[];
};

export type ResultCta =
  | { kind: "book"; query: Record<string, string> }
  | { kind: "enquire"; whatsapp: string | null; phone: string | null; tripText: string };

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 shrink-0 snap-start items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap sm:min-h-10",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** Vehicle offers with client-side filters (category, model, fuel) over server prices. */
export function CabResults({
  offers,
  cta,
  passengers,
  freeCancelHours,
  locale,
}: {
  offers: ResultOffer[];
  cta: ResultCta;
  passengers: number;
  freeCancelHours: number | null;
  locale: string;
}) {
  const t = useTranslations("cabs.results");
  const [filters, setFilters] = useState<OfferFilters>({ categories: [], models: [], fuels: [] });
  const shown = useMemo(() => filterOffers(offers, filters), [offers, filters]);
  const models = [...new Set(offers.flatMap((o) => o.models.map((m) => m.name)))];
  const fuels = [...new Set(offers.flatMap((o) => o.models.map((m) => m.fuel)))];
  const active = filters.categories.length + filters.models.length + filters.fuels.length;

  if (offers.length === 0) {
    return <EmptyState icon={Car} title={t("noCarsTitle")} description={t("noCarsBody")} />;
  }

  return (
    <div className="space-y-4">
      <section aria-label={t("filtersLabel")} className="space-y-3 rounded-2xl border bg-card p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold">
            <SlidersHorizontal className="size-4" aria-hidden="true" /> {t("filtersLabel")}
          </p>
          {active ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ categories: [], models: [], fuels: [] })}
            >
              {t("clearFilters")}
            </Button>
          ) : null}
        </div>
        <div
          role="group"
          aria-label={t("filterType")}
          className="-mx-3 flex snap-x scroll-px-3 [scrollbar-width:none] gap-2 overflow-x-auto px-3 pb-1 sm:-mx-1 sm:px-1 [&::-webkit-scrollbar]:hidden"
        >
          {offers.map((o) => (
            <Chip
              key={o.key}
              on={filters.categories.includes(o.key)}
              onClick={() => setFilters((f) => ({ ...f, categories: toggle(f.categories, o.key) }))}
            >
              {o.name}
            </Chip>
          ))}
        </div>
        {fuels.length > 1 ? (
          <div
            role="group"
            aria-label={t("filterFuel")}
            className="-mx-3 flex snap-x scroll-px-3 [scrollbar-width:none] gap-2 overflow-x-auto px-3 pb-1 sm:-mx-1 sm:px-1 [&::-webkit-scrollbar]:hidden"
          >
            {fuels.map((fuel) => (
              <Chip
                key={fuel}
                on={filters.fuels.includes(fuel)}
                onClick={() => setFilters((f) => ({ ...f, fuels: toggle(f.fuels, fuel) }))}
              >
                <Fuel className="me-1 size-3.5" aria-hidden="true" /> {t(`fuel.${fuel}`)}
              </Chip>
            ))}
          </div>
        ) : null}
        {models.length > 1 ? (
          <div
            role="group"
            aria-label={t("filterModel")}
            className="-mx-3 flex snap-x scroll-px-3 [scrollbar-width:none] gap-2 overflow-x-auto px-3 pb-1 sm:-mx-1 sm:px-1 [&::-webkit-scrollbar]:hidden"
          >
            {models.map((model) => (
              <Chip
                key={model}
                on={filters.models.includes(model)}
                onClick={() => setFilters((f) => ({ ...f, models: toggle(f.models, model) }))}
              >
                {model}
              </Chip>
            ))}
          </div>
        ) : null}
      </section>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("count", { count: shown.length })}
      </p>

      {shown.length === 0 ? (
        <EmptyState icon={SlidersHorizontal} title={t("noMatch")} />
      ) : (
        <ul className="grid gap-3">
          {shown.map((o) => (
            <li key={o.key}>
              <OfferCard
                offer={o}
                cta={cta}
                passengers={passengers}
                freeCancelHours={freeCancelHours}
                locale={locale}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OfferCard({
  offer: o,
  cta,
  passengers,
  freeCancelHours,
  locale,
}: {
  offer: ResultOffer;
  cta: ResultCta;
  passengers: number;
  freeCancelHours: number | null;
  locale: string;
}) {
  const t = useTranslations("cabs.results");
  const fuels = [...new Set(o.models.map((m) => m.fuel))];
  const headingId = `cab-${o.key}`;
  const enquiry =
    cta.kind === "enquire" ? t("whatsappText", { car: o.featured ?? o.name, trip: cta.tripText }) : "";

  return (
    <article
      aria-labelledby={headingId}
      aria-disabled={!o.fits || undefined}
      className={cn(
        "grid gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-[8rem_1fr_auto]",
        !o.fits && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3 sm:block">
        {o.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded car photo
          <img
            src={o.image}
            alt=""
            className="aspect-[4/3] w-24 rounded-xl bg-secondary object-contain sm:w-full"
          />
        ) : (
          <span className="grid aspect-[4/3] w-24 place-items-center rounded-xl bg-secondary text-secondary-foreground sm:w-full">
            <Car className="size-10" aria-hidden="true" />
          </span>
        )}
        <p className="text-xs font-semibold text-primary sm:mt-2 sm:text-center">{o.name}</p>
      </div>

      <div className="min-w-0 space-y-2">
        <h3 id={headingId} className="text-lg leading-snug font-bold">
          {o.featured ? t("orSimilar", { model: o.featured }) : o.name}
        </h3>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <li className="inline-flex items-center gap-1">
            <Users className="size-4" aria-hidden="true" /> {t("seats", { count: o.seats })}
          </li>
          <li className="inline-flex items-center gap-1">
            <Briefcase className="size-4" aria-hidden="true" /> {t("bags", { count: o.luggage })}
          </li>
          {o.isAc ? (
            <li className="inline-flex items-center gap-1">
              <Snowflake className="size-4" aria-hidden="true" /> {t("ac")}
            </li>
          ) : null}
          {fuels.length ? (
            <li className="inline-flex items-center gap-1">
              <Fuel className="size-4" aria-hidden="true" /> {fuels.map((f) => t(`fuel.${f}`)).join(" / ")}
            </li>
          ) : null}
        </ul>
        <p className="text-sm">
          {o.hours
            ? t("includedLocal", { hours: o.hours, km: o.includedKm })
            : t("includedKm", { km: o.includedKm })}
          {o.extraKmPaise > 0 ? (
            <span className="text-muted-foreground">
              {" · "}
              {t("extraKm", { rate: formatPaise(o.extraKmPaise, locale) })}
            </span>
          ) : null}
          {o.extraHourPaise ? (
            <span className="text-muted-foreground">
              {" · "}
              {t("extraHour", { rate: formatPaise(o.extraHourPaise, locale) })}
            </span>
          ) : null}
        </p>
        <ul className="flex flex-wrap gap-2 text-xs">
          {freeCancelHours !== null ? (
            <li className="inline-flex items-center gap-1 rounded-full bg-accent-green/10 px-2 py-1 text-accent-green">
              <ShieldCheck className="size-3" aria-hidden="true" />
              {t("freeCancel", { hours: freeCancelHours })}
            </li>
          ) : null}
          {o.addons.length ? (
            <li className="rounded-full bg-secondary px-2 py-1 text-secondary-foreground">
              {t("addonsAvailable", { list: o.addons.join(", ") })}
            </li>
          ) : null}
        </ul>
        {!o.fits ? (
          <p className="text-sm font-semibold text-destructive">
            {t("tooSmall", { seats: o.seats, passengers })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-row items-end justify-between gap-3 border-t pt-3 sm:flex-col sm:border-0 sm:pt-0 sm:text-right">
        <div>
          <p className="text-2xl font-extrabold text-heading">{formatPaise(o.totalPaise, locale)}</p>
          <p className="text-xs text-muted-foreground">{t("inclTaxes")}</p>
        </div>
        {!o.fits ? (
          <Button size="lg" disabled>
            {t("select")}
          </Button>
        ) : cta.kind === "book" ? (
          <Button asChild size="lg">
            <Link
              href={{ pathname: "/cabs/review", query: { ...cta.query, category: o.key } }}
              aria-label={t("selectCar", { car: o.featured ?? o.name })}
            >
              {t("select")} <ChevronRight />
            </Link>
          </Button>
        ) : cta.whatsapp ? (
          <Button asChild size="lg">
            <a
              href={`https://wa.me/${cta.whatsapp}?text=${encodeURIComponent(enquiry)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle /> {t("enquire")}
            </a>
          </Button>
        ) : cta.phone ? (
          <Button asChild size="lg">
            <a href={`tel:${cta.phone}`}>
              <Phone /> {t("call")}
            </a>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
