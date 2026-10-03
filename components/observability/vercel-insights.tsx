"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { redactAnalyticsEvent } from "@/lib/analytics";

/**
 * Vercel Web Analytics + Speed Insights: cookieless, first-party
 * /_vercel/* endpoints, scripts loaded after hydration. Outside a Vercel
 * deployment the scripts simply 404 and nothing is sent.
 */
export function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={redactAnalyticsEvent} />
      <SpeedInsights beforeSend={redactAnalyticsEvent} />
    </>
  );
}
