import { describe, expect, it } from "vitest";
import { isGuestOnlyPath, isProtectedPath, localizedPath, splitLocale } from "@/lib/routing/protected";
import { safeNextPath } from "@/lib/utils";

describe("splitLocale", () => {
  it.each([
    ["/", "en", "/"],
    ["/admin", "en", "/admin"],
    ["/hi", "hi", "/"],
    ["/hi/admin/hotels", "hi", "/admin/hotels"],
    ["/account/", "en", "/account"],
    ["/history", "en", "/history"],
  ])("%s → %s %s", (input, locale, path) => {
    expect(splitLocale(input)).toEqual({ locale, path });
  });
});

describe("protected paths", () => {
  it("matches whole segments only", () => {
    expect(isProtectedPath("/admin")).toBe(true);
    expect(isProtectedPath("/admin/hotels")).toBe(true);
    expect(isProtectedPath("/driver")).toBe(true);
    expect(isProtectedPath("/administrator")).toBe(false);
    expect(isProtectedPath("/services/car")).toBe(false);
  });

  it("detects guest-only pages", () => {
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/account")).toBe(false);
  });
});

describe("localizedPath", () => {
  it("leaves English unprefixed", () => {
    expect(localizedPath("en", "/login")).toBe("/login");
    expect(localizedPath("hi", "/login")).toBe("/hi/login");
    expect(localizedPath("hi", "/")).toBe("/hi");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/account", "/account"],
    ["/hi/admin?x=1", "/hi/admin?x=1"],
    ["https://evil.example", "/fallback"],
    ["//evil.example", "/fallback"],
    ["/\\evil.example", "/fallback"],
    [null, "/fallback"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input, "/fallback")).toBe(expected);
  });
});
