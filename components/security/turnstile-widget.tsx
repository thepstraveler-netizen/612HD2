"use client";

import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (D-094). Renders nothing, and loads no script,
 * unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Hands the one-time token to
 * `onToken` (null when it expires or fails). Tokens are single use: bump
 * `resetKey` after each submit so the next attempt gets a fresh one.
 */

type TurnstileOptions = {
  sitekey: string;
  action?: string;
  language?: string;
  theme?: "auto" | "light" | "dark";
  size?: "normal" | "flexible" | "compact";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no turnstile")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function isTurnstileConfigured(): boolean {
  return SITE_KEY !== "";
}

export function TurnstileWidget({
  onToken,
  action,
  resetKey = 0,
  className,
}: {
  onToken: (token: string | null) => void;
  /** Shown in Cloudflare analytics, e.g. "signup" or "enquiry". */
  action?: string;
  resetKey?: number;
  className?: string;
}) {
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;

  useEffect(() => {
    if (!SITE_KEY || !container.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    callback.current(null);
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widgetId = api.render(container.current, {
          sitekey: SITE_KEY,
          action,
          language: locale === "hi" ? "hi" : "en",
          theme: "auto",
          size: "flexible",
          callback: (token) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "error-callback": () => callback.current(null),
        });
      })
      .catch((error: unknown) => console.error(error));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, locale, resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={container} className={className} data-testid="turnstile" />;
}
