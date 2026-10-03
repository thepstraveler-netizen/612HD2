import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Only allow same-origin relative paths as post-login redirect targets, so a
 * crafted `?next=https://evil.example` link cannot bounce users off-site.
 * Control characters and backslashes are refused outright: URL parsers strip
 * tabs and newlines, so `/\t/evil.example` would otherwise become `//evil.example`.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/account"): string {
  // eslint-disable-next-line no-control-regex
  if (!next || /[\u0000-\u001F\u007F\\]/.test(next) || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }
  const url = new URL(next, "http://local.invalid");
  return url.origin === "http://local.invalid" ? url.pathname + url.search + url.hash : fallback;
}
