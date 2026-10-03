/**
 * Brand constants shared by the manifest, the generated icons and the OG
 * images. Colours mirror the tokens in app/globals.css.
 */
export const BRAND = {
  name: "The P & S Traveler Group",
  shortName: "P&S Traveler",
  tagline: "Connecting Travel, Hospitality & Local Services in Vrindavan",
  strapline: "Travel · Hotels · Local Services",
  navy: "#0b2e6b",
  navyDeep: "#071f4a",
  blue: "#1d4ed8",
  sky: "#e8f1fb",
  skySoft: "#f5f9ff",
  white: "#ffffff",
} as const;

/** Icon files served by app/icons/[name]/route.tsx: name → pixel size and style. */
export const ICONS = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
  "apple-touch-icon.png": { size: 180, maskable: true },
} as const;

export type IconName = keyof typeof ICONS;

export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

/** Name of the Cache Storage bucket holding trip pages for offline use (must match public/sw.js). */
export const TRIPS_CACHE = "ps-trips-v1";
