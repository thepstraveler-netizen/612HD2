import { defineRouting } from "next-intl/routing";

/**
 * English is the default and is served without a prefix (`/`), Hindi lives
 * under `/hi`. Adding a locale later only needs a new entry here plus a
 * messages file.
 */
export const routing = defineRouting({
  locales: ["en", "hi"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
