import type { Attribution } from "@/schemas/packages";
import { utmFromSearch } from "./attribution";

/**
 * Where this visit started, captured once per browser session by
 * components/leads/attribution and sent with every enquiry. Pure: the
 * component does the storage. The server re-validates with attributionSchema.
 */

export const VISIT_STORAGE_KEY = "pst.visit";

export type Visit = {
  utm: Attribution["utm"];
  referrer?: string;
  landingPath?: string;
};

/** The first page of a visit: UTM tags, an outside referrer and the landing path (with its query). */
export function captureVisit(input: {
  search: string;
  referrer: string;
  pathname: string;
  host: string;
}): Visit {
  const visit: Visit = { utm: utmFromSearch(new URLSearchParams(input.search)) };
  if (input.referrer) {
    try {
      const ref = new URL(input.referrer);
      // Moving between our own pages is not a source.
      if (ref.host !== input.host) visit.referrer = ref.href.slice(0, 500);
    } catch {
      // Not a URL: ignore.
    }
  }
  const path = `${input.pathname}${input.search}`;
  if (path) visit.landingPath = path.slice(0, 500);
  return visit;
}

/** Reads a stored visit back; anything unexpected becomes an empty attribution. */
export function visitToAttribution(stored: string | null): Attribution {
  if (!stored) return { utm: {} };
  try {
    const raw: unknown = JSON.parse(stored);
    if (!raw || typeof raw !== "object") return { utm: {} };
    const v = raw as Record<string, unknown>;
    const str = (x: unknown, max: number) => (typeof x === "string" && x ? x.slice(0, max) : undefined);
    const utmRaw = v.utm && typeof v.utm === "object" ? (v.utm as Record<string, unknown>) : {};
    const utm: Attribution["utm"] = {};
    for (const key of ["source", "medium", "campaign", "term", "content"] as const) {
      const value = str(utmRaw[key], key === "source" || key === "medium" ? 80 : 120);
      if (value) utm[key] = value;
    }
    const out: Attribution = { utm };
    const referrer = str(v.referrer, 500);
    const landingPath = str(v.landingPath, 500);
    if (referrer) out.referrer = referrer;
    if (landingPath) out.landingPath = landingPath;
    return out;
  } catch {
    return { utm: {} };
  }
}
