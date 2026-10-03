/**
 * Content-Security-Policy for every route (D-012, replaced by D-096).
 *
 * A static header rather than per-request nonces: nonces would force every
 * page to render dynamically and break the ISR / static catalog pages. Next
 * and next-themes inject small inline scripts, so script-src keeps
 * 'unsafe-inline'; the policy still pins every script, frame and connection
 * origin, blocks plugins, framing and form posts to other sites.
 *
 * Plain module (no server-only) because next.config.ts imports it.
 *
 * External origins in use:
 *   - Supabase (REST, Storage uploads, Realtime): connect https + wss
 *   - Razorpay Checkout: script, API / lumberjack beacons, payment iframes
 *     (plus *.razorpay.com, where newer checkout builds load static assets)
 *   - Cloudflare Turnstile: script, siteverify widget iframe
 *   - Vercel Web Analytics / Speed Insights: script in dev builds, vitals beacon
 *   - Sentry ingest (only when NEXT_PUBLIC_SENTRY_DSN is set)
 *   - Map tiles (Leaflet, any XYZ server from settings) and CMS / review
 *     images load as images: img-src allows https:
 *   - WhatsApp, Google Maps and social links are plain navigations: no CSP entry.
 */

export type CspOptions = {
  isDev: boolean;
  /** Add upgrade-insecure-requests (production over HTTPS only; it breaks http://localhost). */
  upgradeInsecure?: boolean;
  supabaseUrl?: string | null;
  sentryDsn?: string | null;
};

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ isDev, upgradeInsecure = false, supabaseUrl, sentryDsn }: CspOptions): string {
  const supabase = originOf(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const sentry = originOf(sentryDsn);

  const directives: Record<string, (string | null | false)[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      isDev && "'unsafe-eval'",
      "https://checkout.razorpay.com",
      "https://*.razorpay.com",
      "https://challenges.cloudflare.com",
      "https://va.vercel-scripts.com",
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      supabase,
      supabaseWs,
      "https://api.razorpay.com",
      "https://lumberjack.razorpay.com",
      "https://*.razorpay.com",
      "https://vitals.vercel-insights.com",
      "https://challenges.cloudflare.com",
      sentry,
      // Dev server hot reload.
      isDev && "ws:",
    ],
    "frame-src": [
      "https://api.razorpay.com",
      "https://checkout.razorpay.com",
      "https://*.razorpay.com",
      "https://challenges.cloudflare.com",
    ],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(([name, values]) => {
    const unique = [...new Set(values.filter((v): v is string => Boolean(v)))];
    return `${name} ${unique.join(" ")}`;
  });
  if (upgradeInsecure && !isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
