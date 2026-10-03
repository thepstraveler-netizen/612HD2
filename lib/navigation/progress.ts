/**
 * A tiny event bus for the top navigation bar (D-105). Link clicks are seen
 * by the bar itself; router.push / replace calls announce themselves here
 * (see i18n/navigation.ts), so buttons that navigate show it too.
 */
export const NAVIGATION_START = "ps:navigation-start";

export function startNavigationProgress() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAVIGATION_START));
}

/**
 * Whether going to `href` from `current` changes the page: same origin, and
 * a different path or query (a hash-only jump stays on the page).
 */
export function changesPage(href: string, current: string): boolean {
  let next: URL;
  let now: URL;
  try {
    now = new URL(current);
    next = new URL(href, now);
  } catch {
    return false;
  }
  return next.origin === now.origin && (next.pathname !== now.pathname || next.search !== now.search);
}
