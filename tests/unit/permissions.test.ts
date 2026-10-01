import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_MODULE_DEFS } from "@/lib/admin/modules";
import { hasAnyPermission, hasPermission, isAdminModule, visibleModules } from "@/lib/permissions/check";
import { ADMIN_MODULES, ALL_PERMISSIONS, ROLES } from "@/lib/permissions/constants";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions/matrix";
import { renderRbacSeedSql } from "@/lib/permissions/sql";

describe("permission matrix", () => {
  it("covers all 18 admin modules in the sidebar", () => {
    expect(ADMIN_MODULES).toHaveLength(18);
    expect(ADMIN_MODULE_DEFS.map((m) => m.key).sort()).toEqual([...ADMIN_MODULES].sort());
  });

  it("only grants permissions that exist", () => {
    for (const role of ROLES) {
      for (const p of DEFAULT_ROLE_PERMISSIONS[role]) expect(ALL_PERMISSIONS).toContain(p);
    }
  });

  it("keeps refunds and role management away from managers and agents", () => {
    for (const role of ["manager", "agent"] as const) {
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain("payments.refund");
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain("users.manage_roles");
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain("settings.write");
    }
  });

  it("gives customers no admin permissions", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.customer).toEqual([]);
  });

  it("matches the committed SQL seed migration (run `pnpm rbac:generate` if this fails)", () => {
    const committed = readFileSync(
      join(__dirname, "../../supabase/migrations/20261001000400_rbac_seed.sql"),
      "utf8",
    );
    expect(committed).toBe(renderRbacSeedSql());
  });
});

describe("permission checks", () => {
  const granted = ["hotels.read", "hotels.write", "leads.read"];

  it("hasPermission matches exact keys only", () => {
    expect(hasPermission(granted, "hotels.write")).toBe(true);
    expect(hasPermission(granted, "cabs.read")).toBe(false);
  });

  it("hasAnyPermission", () => {
    expect(hasAnyPermission(granted, ["cabs.read", "leads.read"])).toBe(true);
    expect(hasAnyPermission(granted, ["cabs.read"])).toBe(false);
  });

  it("visibleModules keeps sidebar order and needs .read", () => {
    expect(visibleModules(["leads.read", "hotels.read", "cabs.write"])).toEqual(["hotels", "leads"]);
  });

  it("isAdminModule rejects unknown segments", () => {
    expect(isAdminModule("hotels")).toBe(true);
    expect(isAdminModule("../etc")).toBe(false);
  });
});
