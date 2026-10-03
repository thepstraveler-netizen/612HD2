import { z } from "zod";
import { customerFiltersSchema, type CustomerFilters } from "@/schemas/engagement-admin";

/** Pure helpers for Admin → Customers: URL filters, RPC arguments, summaries and error codes. */

export function parseCustomerFilters(raw: Record<string, string | string[] | undefined>): CustomerFilters {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") flat[key] = v;
  }
  return customerFiltersSchema.parse(flat);
}

/** Filters → `?q=…&blocked=yes&page=2` (page 1 left out); `overrides` replace single keys. */
export function customersQuery(filters: CustomerFilters, overrides: Partial<CustomerFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.blocked) params.set("blocked", merged.blocked);
  if (merged.booked) params.set("booked", merged.booked);
  if (merged.page > 1) params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

const yesNoToBool = (v: "yes" | "no" | undefined) => (v === undefined ? null : v === "yes");

/** Arguments for public.admin_customers. */
export function customerSearchArgs(filters: CustomerFilters, pageSize: number) {
  return {
    p_search: filters.q || null,
    p_blocked: yesNoToBool(filters.blocked),
    p_has_bookings: yesNoToBool(filters.booked),
    p_limit: pageSize,
    p_offset: (filters.page - 1) * pageSize,
  };
}

const n = z.coerce.number().int().catch(0);
export const customerSummarySchema = z.object({
  bookings: n,
  completed: n,
  cancelled: n,
  spend_paise: n,
  points: n,
  last_booking_at: z.string().nullable().catch(null),
});
export type CustomerSummary = z.output<typeof customerSummarySchema>;

export function parseCustomerSummary(value: unknown): CustomerSummary {
  return customerSummarySchema.parse(value ?? {});
}

const ADJUST_ERRORS = ["invalid_amount", "reason_required", "not_found", "insufficient_points"] as const;
export type AdjustPointsError = (typeof ADJUST_ERRORS)[number];

/** The adjust_points exception named in a database error message, if any. */
export function adjustPointsError(message: string | undefined): AdjustPointsError | null {
  if (!message) return null;
  return ADJUST_ERRORS.find((code) => message.includes(code)) ?? null;
}
