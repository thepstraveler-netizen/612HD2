import {
  ADMIN_MODULES,
  ALL_PERMISSIONS,
  type AdminModuleKey,
  type PermissionKey,
  type RoleKey,
} from "./constants";

const read = (modules: readonly AdminModuleKey[]): PermissionKey[] =>
  modules.map((m) => `${m}.read` as const);
const write = (modules: readonly AdminModuleKey[]): PermissionKey[] =>
  modules.map((m) => `${m}.write` as const);

const OPERATIONS: readonly AdminModuleKey[] = [
  "hotels",
  "cabs",
  "rides",
  "food",
  "medicine",
  "packages",
  "leads",
  "bookings",
  "offers",
  "cms",
  "vendors",
  "customers",
  "reviews",
];

/**
 * Default permission matrix. Admins can change grants at runtime in the
 * `role_permissions` table; this is what a fresh database starts with.
 *
 * - super_admin / admin: everything. Only a super_admin may grant the
 *   super_admin role (enforced in RLS, not here).
 * - manager: reads everything, runs day-to-day operations, but cannot
 *   refund, change settings or manage roles.
 * - agent: travel agent / calling centre; leads, bookings and the catalog
 *   they need to quote from.
 * - vendor / driver: only their portal; row scoping to their own data is
 *   enforced per table in later phases.
 * - customer: no admin permissions; owns their rows through RLS.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  manager: [...read(ADMIN_MODULES), ...write(OPERATIONS), "audit.read"],
  agent: [
    "dashboard.read",
    ...read(["hotels", "cabs", "rides", "packages", "customers", "offers"]),
    ...read(["leads", "bookings"]),
    ...write(["leads", "bookings"]),
  ],
  vendor: ["vendor.portal"],
  driver: ["driver.portal"],
  customer: [],
};
