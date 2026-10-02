"use client";

import { useEffect } from "react";
import { captureVisit, VISIT_STORAGE_KEY, visitToAttribution } from "@/lib/leads/visit";
import type { Attribution } from "@/schemas/packages";

/**
 * Remembers where a visit started (UTM tags from Instagram / WhatsApp
 * campaign links, the referring site, the landing page) for the enquiry
 * forms. Session storage only, first page of the visit only; storage can
 * be blocked, so every access is guarded and the page never depends on it.
 */
export function VisitTracker() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(VISIT_STORAGE_KEY)) return;
      const visit = captureVisit({
        search: window.location.search,
        referrer: document.referrer,
        pathname: window.location.pathname,
        host: window.location.host,
      });
      window.sessionStorage.setItem(VISIT_STORAGE_KEY, JSON.stringify(visit));
    } catch {
      // Storage blocked (private mode, settings): enquiries go without attribution.
    }
  }, []);
  return null;
}

/** The visit's attribution for an enquiry; empty when nothing was stored. */
export function readAttribution(): Attribution {
  try {
    return visitToAttribution(window.sessionStorage.getItem(VISIT_STORAGE_KEY));
  } catch {
    return { utm: {} };
  }
}
