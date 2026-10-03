import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "./site";

/** Private or per-user areas crawlers should skip (each also under every locale prefix). */
export const PRIVATE_PATHS = [
  "/admin",
  "/account",
  "/vendor",
  "/driver",
  "/delivery",
  "/api",
  "/auth",
  "/checkout",
  "/quote",
] as const;

export function disallowedPaths(): string[] {
  const prefixes = routing.locales.filter((l) => l !== routing.defaultLocale).map((l) => `/${l}`);
  return PRIVATE_PATHS.flatMap((path) => [path, ...prefixes.map((prefix) => `${prefix}${path}`)]);
}

export function buildRobots(): MetadataRoute.Robots {
  const site = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: disallowedPaths() }],
    sitemap: `${site}/sitemap.xml`,
  };
}
