import {
  BarChart3,
  Bell,
  Bike,
  BookOpenCheck,
  Building2,
  Car,
  CreditCard,
  FileText,
  Gauge,
  Handshake,
  Map,
  MessageSquareQuote,
  Pill,
  Settings,
  Star,
  TicketPercent,
  UsersRound,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { AdminModuleKey } from "@/lib/permissions/constants";

export type AdminModuleGroup = "overview" | "catalog" | "sales" | "people" | "content" | "system";

export type AdminModule = {
  key: AdminModuleKey;
  icon: LucideIcon;
  group: AdminModuleGroup;
  /** Build phase that delivers this module's screens. */
  phase: number;
};

/** Sidebar order and grouping for the 18 admin modules. */
export const ADMIN_MODULE_DEFS: readonly AdminModule[] = [
  { key: "dashboard", icon: Gauge, group: "overview", phase: 10 },
  { key: "reports", icon: BarChart3, group: "overview", phase: 10 },
  { key: "hotels", icon: Building2, group: "catalog", phase: 3 },
  { key: "cabs", icon: Car, group: "catalog", phase: 5 },
  { key: "rides", icon: Bike, group: "catalog", phase: 6 },
  { key: "food", icon: UtensilsCrossed, group: "catalog", phase: 7 },
  { key: "medicine", icon: Pill, group: "catalog", phase: 7 },
  { key: "packages", icon: Map, group: "catalog", phase: 8 },
  { key: "bookings", icon: BookOpenCheck, group: "sales", phase: 4 },
  { key: "payments", icon: CreditCard, group: "sales", phase: 4 },
  { key: "offers", icon: TicketPercent, group: "sales", phase: 4 },
  { key: "leads", icon: MessageSquareQuote, group: "sales", phase: 8 },
  { key: "customers", icon: UsersRound, group: "people", phase: 10 },
  { key: "vendors", icon: Handshake, group: "people", phase: 9 },
  { key: "reviews", icon: Star, group: "people", phase: 10 },
  { key: "cms", icon: FileText, group: "content", phase: 2 },
  { key: "notifications", icon: Bell, group: "content", phase: 4 },
  { key: "settings", icon: Settings, group: "system", phase: 2 },
];

export const ADMIN_GROUP_ORDER: readonly AdminModuleGroup[] = [
  "overview",
  "catalog",
  "sales",
  "people",
  "content",
  "system",
];

export function adminModuleHref(key: AdminModuleKey): string {
  return key === "dashboard" ? "/admin" : `/admin/${key}`;
}
