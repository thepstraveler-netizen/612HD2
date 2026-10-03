/**
 * Acceptance: admin edits show on the public site without a redeploy.
 *
 * Public pages read through `unstable_cache` entries tagged `catalog`
 * (lib/catalog/queries.ts, lib/hotels/queries.ts, …). Every admin mutation
 * goes through `mutate()` (lib/admin/mutate.ts), which revalidates that tag
 * after a successful write. These tests run the real admin actions for
 * hotels, cabs, coupons, banners, packages, menu items and CMS content with a
 * stubbed Supabase client, and check that:
 *   - the right permission is asked for and the right table is written,
 *   - `revalidateTag("catalog")` runs after the write (and not on failure),
 *   - the public reads for that content are cached under the same tag.
 * Coupons are read live at checkout (lib/coupons/check.ts, no cache), so a
 * coupon edit applies on the next price check even before revalidation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  events: [] as string[],
  tables: [] as string[],
  permissions: [] as string[],
  cacheTags: new Map<string, string[]>(),
  denied: false,
  failWrite: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T, keys: string[], opts?: { tags?: string[] }) => {
    h.cacheTags.set(keys.join("|"), opts?.tags ?? []);
    return fn;
  },
  revalidateTag: (tag: string) => h.events.push(`tag:${tag}`),
  revalidatePath: (path: string) => h.events.push(`path:${path}`),
}));
vi.mock("@/lib/auth/guards", () => {
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    assertPermission: async (permission: string) => {
      h.permissions.push(permission);
      if (h.denied) throw new AuthorizationError(permission);
      return { user: { id: "staff" }, permissions: [permission] };
    },
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const result = () => ({
      data: { id: "00000000-0000-4000-8000-000000000001" },
      error: h.failWrite ? { message: "boom", code: "XX000" } : null,
      count: 0,
    });
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "insert", "update", "upsert", "delete", "eq", "in", "is", "order", "limit"])
      chain[m] = () => chain;
    chain.single = async () => {
      h.events.push("write");
      return result();
    };
    chain.maybeSingle = chain.single;
    chain.then = (resolve: (r: unknown) => unknown) => {
      h.events.push("write");
      return Promise.resolve(result()).then(resolve);
    };
    return {
      from: (table: string) => {
        h.tables.push(table);
        return chain;
      },
    };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => null }));
vi.mock("@/lib/notifications/service", () => ({ notify: async () => undefined }));

const ID = "00000000-0000-4000-8000-0000000000aa";

beforeEach(() => {
  h.events.length = 0;
  h.tables.length = 0;
  h.permissions.length = 0;
  h.denied = false;
  h.failWrite = false;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

type Case = {
  name: string;
  run: () => Promise<{ ok: boolean }>;
  permission: string;
  table: string;
  /** unstable_cache keys of the public reads that show this content. */
  publicReads: string[];
};

const cases: Case[] = [
  {
    name: "hotels",
    run: async () => (await import("@/lib/hotels/actions")).deleteHotel({ id: ID }),
    permission: "hotels.write",
    table: "hotels",
    publicReads: ["hotels:catalog", "hotels:calendar"],
  },
  {
    name: "cabs",
    run: async () => (await import("@/lib/cabs/admin-actions")).deleteRoute({ id: ID }),
    permission: "cabs.write",
    table: "cab_routes",
    publicReads: ["cabs:catalog"],
  },
  {
    name: "coupons",
    run: async () => (await import("@/lib/bookings/admin-actions")).deleteCoupon({ id: ID }),
    permission: "offers.write",
    table: "coupons",
    publicReads: [],
  },
  {
    name: "banners",
    run: async () => (await import("@/lib/cms/actions")).deleteBanner({ id: ID }),
    permission: "offers.write",
    table: "offers_banners",
    publicReads: ["catalog:banners"],
  },
  {
    name: "packages",
    run: async () => (await import("@/lib/packages/admin-actions")).archivePackage({ id: ID }),
    permission: "packages.write",
    table: "packages",
    publicReads: ["packages:list", "packages:detail"],
  },
  {
    name: "menu items",
    run: async () => (await import("@/lib/delivery/admin-actions")).deleteItem({ id: ID }),
    permission: "food.write",
    table: "store_items",
    publicReads: ["delivery:menu", "delivery:stores"],
  },
  {
    name: "CMS (FAQ)",
    run: async () => (await import("@/lib/cms/actions")).deleteFaq({ id: ID }),
    permission: "cms.write",
    table: "faqs",
    publicReads: ["catalog:faqs"],
  },
  {
    name: "CMS (testimonial)",
    run: async () => (await import("@/lib/cms/actions")).deleteTestimonial({ id: ID }),
    permission: "cms.write",
    table: "testimonials",
    publicReads: ["catalog:testimonials"],
  },
];

describe("admin edits revalidate the public cache", () => {
  it.each(cases)("$name: checks $permission, writes, then revalidates 'catalog'", async (c) => {
    const result = await c.run();
    expect(result).toMatchObject({ ok: true });
    expect(h.permissions).toEqual([c.permission]);
    expect(h.tables).toContain(c.table);
    const write = h.events.lastIndexOf("write");
    const tag = h.events.indexOf("tag:catalog");
    expect(write).toBeGreaterThanOrEqual(0);
    expect(tag).toBeGreaterThan(write);
    expect(h.events).toContain("path:/[locale]/admin");
  });

  it.each(cases)("$name: public reads are cached under the 'catalog' tag", async (c) => {
    await Promise.all([
      import("@/lib/hotels/queries"),
      import("@/lib/cabs/queries"),
      import("@/lib/catalog/queries"),
      import("@/lib/packages/queries"),
      import("@/lib/delivery/queries"),
    ]);
    for (const key of c.publicReads) {
      expect(h.cacheTags.get(key), key).toContain("catalog");
    }
  });

  it("does not revalidate when the permission check or the write fails", async () => {
    const { deleteBanner } = await import("@/lib/cms/actions");
    h.denied = true;
    expect(await deleteBanner({ id: ID })).toEqual({ ok: false, error: "forbidden" });
    expect(h.tables).toEqual([]);
    h.denied = false;
    h.failWrite = true;
    expect(await deleteBanner({ id: ID })).toEqual({ ok: false, error: "saveFailed" });
    expect(await deleteBanner({ id: "not-a-uuid" })).toMatchObject({ ok: false });
    expect(h.events.filter((e) => e.startsWith("tag:"))).toEqual([]);
  });
});
