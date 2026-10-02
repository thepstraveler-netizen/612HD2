import { addDays, type IsoDate } from "@/lib/dates";
import type { DraftLine } from "@/lib/pricing/booking";
import type { Departure, PackageDetail, PricingTier } from "./types";

/**
 * Package pricing. Pure, over the catalog, so the package page, the
 * checkout preview and the booking action agree to the paisa; the server
 * always re-runs it from the database.
 *
 * Per-traveller price comes from the tier whose group-size range holds the
 * whole group (adults + children). Children pay the tier's child price when
 * it has one. A departure can add a per-traveller supplement (festival
 * dates). GST is the package's rate (tour operator services) on everything.
 */

export function pickTier(tiers: readonly PricingTier[], pax: number): PricingTier | null {
  return (
    [...tiers].sort((a, b) => a.minPax - b.minPax).find((t) => pax >= t.minPax && pax <= t.maxPax) ?? null
  );
}

/** Lowest adult price per person, for "from ₹…" on cards. */
export function fromPrice(tiers: readonly Pick<PricingTier, "adultPricePaise">[]): number | null {
  return tiers.length ? Math.min(...tiers.map((t) => t.adultPricePaise)) : null;
}

export type TierProblem = "empty" | "overlap" | "gap" | "range";

/**
 * Checks admin-entered tiers: each range valid, no overlaps, and together
 * they cover every group size the package allows (min_pax … max_pax).
 */
export function checkTiers(
  tiers: readonly Pick<PricingTier, "minPax" | "maxPax">[],
  minPax: number,
  maxPax: number,
): TierProblem | null {
  if (tiers.length === 0) return "empty";
  const sorted = [...tiers].sort((a, b) => a.minPax - b.minPax);
  if (sorted.some((t) => t.maxPax < t.minPax)) return "range";
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minPax <= sorted[i - 1].maxPax) return "overlap";
  }
  let next = minPax;
  for (const t of sorted) {
    if (t.maxPax < next) continue;
    if (t.minPax > next) return "gap";
    next = t.maxPax + 1;
    if (next > maxPax) return null;
  }
  return next > maxPax ? null : "gap";
}

export function endDate(start: IsoDate, days: number): IsoDate {
  return addDays(start, Math.max(0, days - 1));
}

export type PackageQuote = {
  tier: PricingTier;
  adultPricePaise: number;
  childPricePaise: number;
  supplementPaise: number;
  drafts: DraftLine[];
};

export type PackageQuoteError = "group_size" | "no_tier";

const draft = (d: Omit<DraftLine, "roomId" | "ratePlanId">): DraftLine => ({
  ...d,
  roomId: null,
  ratePlanId: null,
});

export function packageLines(
  pkg: Pick<PackageDetail, "tiers" | "minPax" | "maxPax" | "taxBps" | "sac" | "title" | "days">,
  departure: Pick<Departure, "supplementPaise"> | null,
  input: { startDate: IsoDate; adults: number; children: number },
  fee: { convenienceFeePaise: number; feeTaxBps: number; feeSac: string } | null = null,
): { ok: true; quote: PackageQuote } | { ok: false; error: PackageQuoteError } {
  const pax = input.adults + input.children;
  if (input.adults < 1 || pax < pkg.minPax || pax > pkg.maxPax) return { ok: false, error: "group_size" };
  const tier = pickTier(pkg.tiers, pax);
  if (!tier) return { ok: false, error: "no_tier" };
  const supplement = departure?.supplementPaise ?? 0;
  const adult = tier.adultPricePaise;
  const child = tier.childPricePaise ?? tier.adultPricePaise;
  const tax = { mode: "fixed" as const, rateBps: pkg.taxBps };
  const title = pkg.title.en;

  const drafts: DraftLine[] = [
    draft({
      key: "package:adult",
      kind: "package",
      description: `${title} · ${input.adults} adult${input.adults === 1 ? "" : "s"}`,
      date: input.startDate,
      quantity: input.adults,
      amountPaise: adult * input.adults,
      discountable: true,
      tax,
      sac: pkg.sac,
    }),
  ];
  if (input.children > 0) {
    drafts.push(
      draft({
        key: "package:child",
        kind: "package",
        description: `${title} · ${input.children} child${input.children === 1 ? "" : "ren"}`,
        date: input.startDate,
        quantity: input.children,
        amountPaise: child * input.children,
        discountable: true,
        tax,
        sac: pkg.sac,
      }),
    );
  }
  if (supplement > 0) {
    drafts.push(
      draft({
        key: "surcharge:departure",
        kind: "surcharge",
        description: `Peak date supplement · ${pax} traveller${pax === 1 ? "" : "s"}`,
        date: input.startDate,
        quantity: pax,
        amountPaise: supplement * pax,
        discountable: true,
        tax,
        sac: pkg.sac,
      }),
    );
  }
  if (fee && fee.convenienceFeePaise > 0) {
    drafts.push(
      draft({
        key: "fee:convenience",
        kind: "fee",
        description: "Convenience fee",
        date: null,
        quantity: 1,
        amountPaise: fee.convenienceFeePaise,
        discountable: false,
        tax: { mode: "fixed", rateBps: fee.feeTaxBps },
        sac: fee.feeSac,
      }),
    );
  }
  return {
    ok: true,
    quote: { tier, adultPricePaise: adult, childPricePaise: child, supplementPaise: supplement, drafts },
  };
}

export type DepartureState = "open" | "sold_out" | "closed";

/** Whether a departure can still be booked online (enquiries stay open regardless). */
export function departureState(
  departure: Pick<Departure, "startDate" | "seatsLeft">,
  pax: number,
  today: IsoDate,
  bookUntilDays: number,
): DepartureState {
  if (departure.startDate < addDays(today, bookUntilDays)) return "closed";
  if (departure.seatsLeft !== null && departure.seatsLeft < Math.max(1, pax)) return "sold_out";
  return "open";
}

/** First day a private ("any date") tour can start online. */
export function firstBookableDate(today: IsoDate, bookUntilDays: number): IsoDate {
  return addDays(today, bookUntilDays);
}
