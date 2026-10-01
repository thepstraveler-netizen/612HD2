/**
 * Single source of truth for roles, admin modules and permission keys.
 *
 * The SQL seed for `roles`, `permissions` and `role_permissions` is generated
 * from this file (`pnpm rbac:generate`), and a unit test fails if the two
 * drift apart. Postgres `has_permission()` (RLS) and `requirePermission()`
 * (server) therefore always agree on the same matrix.
 */

export const ROLES = ["super_admin", "admin", "manager", "agent", "vendor", "driver", "customer"] as const;
export type RoleKey = (typeof ROLES)[number];

/** Roles allowed into `/admin`. */
export const STAFF_ROLES: readonly RoleKey[] = ["super_admin", "admin", "manager", "agent"];

/** The 18 admin modules from the master build prompt, section 5.2. */
export const ADMIN_MODULES = [
  "dashboard",
  "hotels",
  "cabs",
  "rides",
  "food",
  "medicine",
  "packages",
  "leads",
  "bookings",
  "payments",
  "offers",
  "cms",
  "vendors",
  "customers",
  "reviews",
  "notifications",
  "settings",
  "reports",
] as const;
export type AdminModuleKey = (typeof ADMIN_MODULES)[number];

type ModulePermission = `${AdminModuleKey}.${"read" | "write"}`;

/** Permissions that do not map 1:1 to an admin module's read/write. */
export const SPECIAL_PERMISSIONS = [
  "payments.refund",
  "users.manage_roles",
  "audit.read",
  "vendor.portal",
  "driver.portal",
] as const;

export type PermissionKey = ModulePermission | (typeof SPECIAL_PERMISSIONS)[number];

export const ALL_PERMISSIONS: readonly PermissionKey[] = [
  ...ADMIN_MODULES.flatMap((m) => [`${m}.read`, `${m}.write`] as const),
  ...SPECIAL_PERMISSIONS,
];

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  manager: "Manager",
  agent: "Agent (travel / calling centre)",
  vendor: "Vendor / partner",
  driver: "Driver",
  customer: "Customer",
};

export const PERMISSION_DESCRIPTIONS: Record<(typeof SPECIAL_PERMISSIONS)[number], string> = {
  "payments.refund": "Issue full or partial refunds",
  "users.manage_roles": "Grant and revoke staff roles",
  "audit.read": "Read the audit log",
  "vendor.portal": "Access the vendor dashboard",
  "driver.portal": "Access the driver trip page",
};
