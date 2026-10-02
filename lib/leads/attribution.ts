import type { Attribution } from "@/schemas/packages";

/**
 * Lead source tracking. The browser captures UTM tags and the referrer on
 * the first page of a visit (components/leads/attribution); this maps them
 * to a CRM source. Pure.
 */

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

export function utmFromSearch(search: URLSearchParams): Attribution["utm"] {
  const utm: Attribution["utm"] = {};
  for (const key of UTM_KEYS) {
    const v = search.get(`utm_${key}`)?.trim();
    if (v) utm[key] = v.slice(0, key === "source" || key === "medium" ? 80 : 120);
  }
  return utm;
}

const HOST_SOURCES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
];

/** CRM source for a lead: explicit source, then utm_source, then the referrer's site, else website. */
export function leadSource(a: Attribution, allowed: readonly string[]): string {
  const pick = (v: string | undefined) => {
    const s = v?.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return s && allowed.includes(s) ? s : null;
  };
  const direct = pick(a.source) ?? pick(a.utm.source);
  if (direct) return direct;
  if (a.referrer) {
    try {
      const host = new URL(a.referrer).hostname.toLowerCase();
      for (const [re, source] of HOST_SOURCES) if (re.test(host) && allowed.includes(source)) return source;
    } catch {
      // Not a URL: ignore.
    }
  }
  return "website";
}
