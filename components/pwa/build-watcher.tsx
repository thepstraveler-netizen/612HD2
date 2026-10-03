"use client";

import { useEffect } from "react";
import { BUILD_ID, isStaleBuildError, shouldHardNavigate, VERSION_PATH } from "@/lib/pwa/build";

const CHECK_EVERY_MS = 10 * 60_000;
const MIN_GAP_MS = 60_000;
const RELOAD_KEY = "ps:stale-reload";

/**
 * Keeps a tab that was open across a deploy working (D-105). Without it, a
 * click in an old tab can ask the new deployment for code it no longer has:
 * the link or button seems dead until the page is reloaded.
 *
 *   - Asks /api/version when the tab comes back into view (and every ten
 *     minutes while visible); once the site has moved on, the next link click
 *     loads the page in full instead of navigating in place.
 *   - If a script chunk or server action is missing anyway, reloads once.
 */
export function BuildWatcher() {
  useEffect(() => {
    if (BUILD_ID === "local") return;
    let stale = false;
    let lastCheck = 0;

    const check = async () => {
      if (stale || document.visibilityState !== "visible" || Date.now() - lastCheck < MIN_GAP_MS) return;
      lastCheck = Date.now();
      try {
        const res = await fetch(VERSION_PATH, { cache: "no-store" });
        if (!res.ok) return;
        const body: unknown = await res.json();
        const build = typeof body === "object" && body !== null ? (body as { build?: unknown }).build : null;
        if (typeof build === "string" && build !== BUILD_ID) stale = true;
      } catch {
        // Offline or a blocked request: try again later.
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!stale || !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!shouldHardNavigate(event, anchor, window.location.origin)) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(anchor.href);
    };

    const reloadOnce = (reason: unknown) => {
      if (!isStaleBuildError(reason)) return;
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
        // A second failure soon after a reload is a real error, not a stale tab.
        if (Date.now() - last < 30_000) return;
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        // Storage blocked: reload anyway, the check above is only a loop guard.
      }
      window.location.reload();
    };
    const onError = (event: ErrorEvent) => reloadOnce(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reloadOnce(event.reason);
    const onVisibility = () => void check();

    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    const timer = window.setInterval(onVisibility, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
