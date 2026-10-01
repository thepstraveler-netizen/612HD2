/**
 * Service accents and the offline service registry.
 *
 * Since Phase 2 the `services` table is the source of truth (name, copy,
 * order, visibility, icon, accent are all admin-editable). This file keeps
 * the Tailwind classes per accent and the slug list used by the offline
 * fallback (lib/catalog/fallback.ts) when Supabase isn't configured.
 */

export type ServiceKind = "bookable" | "enquiry";

export type ServiceAccent =
  "blue" | "teal" | "purple" | "pink" | "green" | "amber" | "red" | "orange" | "magenta" | "indigo";

export const SERVICES = [
  { slug: "travel-hotel-booking", iconName: "plane", accent: "blue", kind: "bookable" },
  { slug: "travel-agent", iconName: "user-round", accent: "teal", kind: "enquiry" },
  { slug: "hotel-photography", iconName: "camera", accent: "blue", kind: "enquiry" },
  { slug: "calling-centre", iconName: "headset", accent: "purple", kind: "enquiry" },
  { slug: "hotel-vendors", iconName: "building-2", accent: "pink", kind: "bookable" },
  { slug: "ota-handling", iconName: "monitor-cog", accent: "teal", kind: "enquiry" },
  { slug: "bike", iconName: "bike", accent: "green", kind: "bookable" },
  { slug: "rickshaw", iconName: "car-taxi-front", accent: "amber", kind: "bookable" },
  { slug: "car", iconName: "car", accent: "red", kind: "bookable" },
  { slug: "food", iconName: "utensils-crossed", accent: "orange", kind: "bookable" },
  { slug: "essentials", iconName: "shopping-cart", accent: "magenta", kind: "bookable" },
  { slug: "medicine", iconName: "pill", accent: "indigo", kind: "bookable" },
  { slug: "instagram-marketing", iconName: "clapperboard", accent: "pink", kind: "enquiry" },
  { slug: "lead-generation", iconName: "megaphone", accent: "teal", kind: "enquiry" },
] as const satisfies readonly { slug: string; iconName: string; accent: ServiceAccent; kind: ServiceKind }[];

/** Static class names so Tailwind can see them at build time. */
export const ACCENT_CLASSES: Record<
  ServiceAccent,
  { badge: string; text: string; ring: string; soft: string }
> = {
  blue: {
    badge: "bg-brand-blue text-white",
    text: "text-brand-blue",
    ring: "ring-brand-blue/20",
    soft: "bg-brand-blue/10",
  },
  teal: {
    badge: "bg-accent-teal text-white",
    text: "text-accent-teal",
    ring: "ring-accent-teal/20",
    soft: "bg-accent-teal/10",
  },
  purple: {
    badge: "bg-accent-purple text-white",
    text: "text-accent-purple",
    ring: "ring-accent-purple/20",
    soft: "bg-accent-purple/10",
  },
  pink: {
    badge: "bg-accent-pink text-white",
    text: "text-accent-pink",
    ring: "ring-accent-pink/20",
    soft: "bg-accent-pink/10",
  },
  green: {
    badge: "bg-accent-green text-white",
    text: "text-accent-green",
    ring: "ring-accent-green/20",
    soft: "bg-accent-green/10",
  },
  amber: {
    badge: "bg-accent-amber text-white",
    text: "text-accent-amber",
    ring: "ring-accent-amber/20",
    soft: "bg-accent-amber/10",
  },
  red: {
    badge: "bg-accent-red text-white",
    text: "text-accent-red",
    ring: "ring-accent-red/20",
    soft: "bg-accent-red/10",
  },
  orange: {
    badge: "bg-accent-orange text-white",
    text: "text-accent-orange",
    ring: "ring-accent-orange/20",
    soft: "bg-accent-orange/10",
  },
  magenta: {
    badge: "bg-accent-magenta text-white",
    text: "text-accent-magenta",
    ring: "ring-accent-magenta/20",
    soft: "bg-accent-magenta/10",
  },
  indigo: {
    badge: "bg-accent-indigo text-white",
    text: "text-accent-indigo",
    ring: "ring-accent-indigo/20",
    soft: "bg-accent-indigo/10",
  },
};
