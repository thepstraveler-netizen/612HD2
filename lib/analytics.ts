/** Paths that carry secrets or booking codes are reported by their route shape only. */
const REDACT: [RegExp, string][] = [
  [/^(\/hi)?\/quote\/[^/]+/, "$1/quote/[token]"],
  [/^(\/hi)?\/account\/trips\/[^/]+/, "$1/account/trips/[code]"],
  [/^(\/hi)?\/account\/prescriptions\/[^/]+/, "$1/account/prescriptions/[id]"],
  [/^(\/hi)?\/driver\/(trip|ride)\/[^/]+/, "$1/driver/$2/[token]"],
  [/^(\/hi)?\/delivery\/order\/[^/]+/, "$1/delivery/order/[token]"],
];

/**
 * URL as sent to Vercel Analytics / Speed Insights: tokens and booking codes
 * in the path are replaced by placeholders and the query string and hash
 * (search text, phone numbers, payment ids) are dropped.
 */
export function redactAnalyticsUrl(href: string): string {
  try {
    const url = new URL(href);
    for (const [pattern, replacement] of REDACT) url.pathname = url.pathname.replace(pattern, replacement);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return href;
  }
}

export function redactAnalyticsEvent<T extends { url: string }>(event: T): T {
  return { ...event, url: redactAnalyticsUrl(event.url) };
}
