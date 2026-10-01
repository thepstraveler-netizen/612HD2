/**
 * Listing state lives in the URL so results are shareable and the back
 * button works. These helpers rewrite a query string without losing the
 * other filters.
 */

export type RawParams = Record<string, string | string[] | undefined>;

/** Keys that describe the stay; carried from the listing to the detail page. */
export const STAY_KEYS = ["checkin", "checkout", "rooms", "adults", "children"] as const;

export function toQuery(raw: RawParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") out[key] = v;
  }
  return out;
}

/**
 * Returns a new query with `changes` applied (`null` removes a key). Any
 * change other than paging resets to page 1.
 */
export function withParams(
  query: Record<string, string>,
  changes: Record<string, string | number | null | undefined>,
): Record<string, string> {
  const next = { ...query };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === "") delete next[key];
    else next[key] = String(value);
  }
  if (!("page" in changes)) delete next.page;
  return next;
}

/** Adds or removes one value of a comma-separated list param. */
export function toggleListValue(current: string | undefined, value: string): string | null {
  const items = new Set((current ?? "").split(",").filter(Boolean));
  if (items.has(value)) items.delete(value);
  else items.add(value);
  return items.size ? [...items].join(",") : null;
}

export function pickStay(query: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of STAY_KEYS) if (query[key]) out[key] = query[key];
  return out;
}

export function queryString(query: Record<string, string>): string {
  const s = new URLSearchParams(query).toString();
  return s ? `?${s}` : "";
}

/** Keys owned by the filter panel; "Clear all" removes exactly these. */
export const FILTER_KEYS = [
  "price_min",
  "price_max",
  "stars",
  "rating",
  "type",
  "amenities",
  "breakfast",
  "couple",
  "free_cancel",
  "landmark",
  "within",
] as const;

/** Number of filters in use, counting a price range or a landmark radius once. */
export function countActiveFilters(query: Record<string, string>): number {
  const price = query.price_min || query.price_max ? 1 : 0;
  return (
    price + FILTER_KEYS.filter((k) => !["price_min", "price_max", "within"].includes(k) && query[k]).length
  );
}
