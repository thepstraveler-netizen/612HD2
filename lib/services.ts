import {
  Bike,
  Building2,
  Camera,
  Car,
  CarTaxiFront,
  Clapperboard,
  Headset,
  Megaphone,
  MonitorCog,
  Pill,
  Plane,
  ShoppingCart,
  UserRound,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

/**
 * The 14 services from the poster, keyed by slug.
 *
 * Phase 1 keeps presentation metadata (icon + accent) in code so the shell
 * renders without a database. Phase 2 adds the `services` table holding the
 * admin-editable copy, ordering, visibility and config; this registry then
 * only maps a service slug to its icon and accent. See docs/DECISIONS.md (D-008).
 */

export type ServiceKind = "bookable" | "enquiry";

export type ServiceAccent =
  "blue" | "teal" | "purple" | "pink" | "green" | "amber" | "red" | "orange" | "magenta" | "indigo";

export type ServiceDefinition = {
  slug: string;
  icon: LucideIcon;
  accent: ServiceAccent;
  kind: ServiceKind;
};

export const SERVICES = [
  { slug: "travel-hotel-booking", icon: Plane, accent: "blue", kind: "bookable" },
  { slug: "travel-agent", icon: UserRound, accent: "teal", kind: "enquiry" },
  { slug: "hotel-photography", icon: Camera, accent: "blue", kind: "enquiry" },
  { slug: "calling-centre", icon: Headset, accent: "purple", kind: "enquiry" },
  { slug: "hotel-vendors", icon: Building2, accent: "pink", kind: "bookable" },
  { slug: "ota-handling", icon: MonitorCog, accent: "teal", kind: "enquiry" },
  { slug: "bike", icon: Bike, accent: "green", kind: "bookable" },
  { slug: "rickshaw", icon: CarTaxiFront, accent: "amber", kind: "bookable" },
  { slug: "car", icon: Car, accent: "red", kind: "bookable" },
  { slug: "food", icon: UtensilsCrossed, accent: "orange", kind: "bookable" },
  { slug: "essentials", icon: ShoppingCart, accent: "magenta", kind: "bookable" },
  { slug: "medicine", icon: Pill, accent: "indigo", kind: "bookable" },
  { slug: "instagram-marketing", icon: Clapperboard, accent: "pink", kind: "enquiry" },
  { slug: "lead-generation", icon: Megaphone, accent: "teal", kind: "enquiry" },
] as const satisfies readonly ServiceDefinition[];

export type ServiceSlug = (typeof SERVICES)[number]["slug"];

export function getService(slug: string): ServiceDefinition | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

/** Static class names so Tailwind can see them at build time. */
export const ACCENT_CLASSES: Record<ServiceAccent, { badge: string; text: string; ring: string }> = {
  blue: { badge: "bg-brand-blue text-white", text: "text-brand-blue", ring: "ring-brand-blue/20" },
  teal: { badge: "bg-accent-teal text-white", text: "text-accent-teal", ring: "ring-accent-teal/20" },
  purple: { badge: "bg-accent-purple text-white", text: "text-accent-purple", ring: "ring-accent-purple/20" },
  pink: { badge: "bg-accent-pink text-white", text: "text-accent-pink", ring: "ring-accent-pink/20" },
  green: { badge: "bg-accent-green text-white", text: "text-accent-green", ring: "ring-accent-green/20" },
  amber: { badge: "bg-accent-amber text-white", text: "text-accent-amber", ring: "ring-accent-amber/20" },
  red: { badge: "bg-accent-red text-white", text: "text-accent-red", ring: "ring-accent-red/20" },
  orange: { badge: "bg-accent-orange text-white", text: "text-accent-orange", ring: "ring-accent-orange/20" },
  magenta: {
    badge: "bg-accent-magenta text-white",
    text: "text-accent-magenta",
    ring: "ring-accent-magenta/20",
  },
  indigo: { badge: "bg-accent-indigo text-white", text: "text-accent-indigo", ring: "ring-accent-indigo/20" },
};
