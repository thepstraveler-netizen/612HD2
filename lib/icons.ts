import {
  Bike,
  Building2,
  Bus,
  Camera,
  Car,
  CarTaxiFront,
  Clapperboard,
  Compass,
  Headset,
  Heart,
  House,
  Leaf,
  MapPin,
  Megaphone,
  MonitorCog,
  Pill,
  Plane,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons the admin can pick for services and CMS items, by lucide name.
 * Kept to an explicit list so the client bundle doesn't ship all of lucide.
 */
export const ICONS: Record<string, LucideIcon> = {
  bike: Bike,
  "building-2": Building2,
  bus: Bus,
  camera: Camera,
  car: Car,
  "car-taxi-front": CarTaxiFront,
  clapperboard: Clapperboard,
  compass: Compass,
  headset: Headset,
  heart: Heart,
  house: House,
  leaf: Leaf,
  "map-pin": MapPin,
  megaphone: Megaphone,
  "monitor-cog": MonitorCog,
  pill: Pill,
  plane: Plane,
  "share-2": Share2,
  "shield-check": ShieldCheck,
  "shopping-cart": ShoppingCart,
  sparkles: Sparkles,
  "trending-up": TrendingUp,
  "user-round": UserRound,
  users: Users,
  "utensils-crossed": UtensilsCrossed,
};

export const ICON_NAMES = Object.keys(ICONS).sort();

export function getIcon(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Sparkles;
}
