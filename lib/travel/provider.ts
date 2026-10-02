import type { TravelMode } from "@/schemas/packages";

/**
 * Flights, trains and buses come from external inventory (airline / GDS
 * aggregators, IRCTC agents, bus aggregators). Business logic talks only to
 * this interface, so a live provider can be added later without touching
 * the enquiry, CRM or payment code (no vendor lock-in).
 *
 * Today the only provider is "manual": search returns nothing and every
 * search becomes an enquiry the travel desk quotes by hand (lead → quote →
 * payment link). A live adapter returns options the customer can pick,
 * and the picked option still goes through a quote so the price is
 * re-checked before payment.
 */

export type TravelSearch = {
  mode: TravelMode;
  from: string;
  to: string;
  departOn: string;
  returnOn: string | null;
  adults: number;
  children: number;
  travelClass: string | null;
};

export type TravelOption = {
  /** Provider-scoped id, passed back to `hold`. */
  id: string;
  mode: TravelMode;
  carrier: string;
  /** Flight number, train number or bus operator's service id. */
  number: string;
  departAt: string;
  arriveAt: string;
  durationMinutes: number;
  stops: number;
  travelClass: string;
  /** All travellers, before our service fee and GST. */
  farePaise: number;
  seatsLeft: number | null;
  refundable: boolean;
};

export interface TravelInventoryProvider {
  readonly key: string;
  /** Whether customers can see live options (false = enquiry only). */
  readonly live: boolean;
  search(query: TravelSearch): Promise<TravelOption[]>;
  /** Re-prices an option right before quoting; null when it is gone. */
  reprice(optionId: string, query: TravelSearch): Promise<TravelOption | null>;
}

export const manualProvider: TravelInventoryProvider = {
  key: "manual",
  live: false,
  async search() {
    return [];
  },
  async reprice() {
    return null;
  },
};

const PROVIDERS: Record<string, TravelInventoryProvider> = { manual: manualProvider };

/** The provider named in travel.defaults; unknown keys fall back to manual. */
export function travelProvider(key: string): TravelInventoryProvider {
  return PROVIDERS[key] ?? manualProvider;
}
