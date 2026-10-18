import { describe, expect, it } from "vitest";
import {
  amrMethodsFromAccessToken,
  decideStaffPassword,
  isStrongPassword,
  staffPasswordRedirectHref,
} from "@/lib/auth/staff-password";
import { signUpSchema } from "@/schemas/auth";

const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;

describe("staff password rule", () => {
  it("needs 8+ characters with a letter, a number and a symbol", () => {
    expect(isStrongPassword("Radhe@2026")).toBe(true);
    expect(isStrongPassword("राधे@2026")).toBe(true);
    expect(isStrongPassword("R@1abcd")).toBe(false);
    expect(isStrongPassword("radhe2026")).toBe(false);
    expect(isStrongPassword("radhe@krishna")).toBe(false);
    expect(isStrongPassword("12345678@")).toBe(false);
  });

  it("applies to new passwords at sign-up", () => {
    const base = { fullName: "Test User", email: "a@b.in" };
    expect(signUpSchema.safeParse({ ...base, password: "password1" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "Password#1" }).success).toBe(true);
  });

  it("reads sign-in methods from the access token", () => {
    expect(amrMethodsFromAccessToken(token({ amr: [{ method: "password" }, { method: "totp" }] }))).toEqual([
      "password",
      "totp",
    ]);
    expect(amrMethodsFromAccessToken(token({}))).toEqual([]);
    expect(amrMethodsFromAccessToken("garbage")).toEqual([]);
    expect(amrMethodsFromAccessToken(null)).toEqual([]);
  });

  it("sends staff without a password sign-in or a strong password to the right page", () => {
    expect(decideStaffPassword({ isStaff: false, methods: ["otp"], passwordStrong: false })).toBe("allow");
    expect(decideStaffPassword({ isStaff: true, methods: ["otp"], passwordStrong: true })).toBe(
      "confirmPassword",
    );
    expect(decideStaffPassword({ isStaff: true, methods: ["oauth"], passwordStrong: true })).toBe(
      "confirmPassword",
    );
    expect(decideStaffPassword({ isStaff: true, methods: ["password"], passwordStrong: false })).toBe(
      "strengthenPassword",
    );
    expect(decideStaffPassword({ isStaff: true, methods: ["password", "totp"], passwordStrong: true })).toBe(
      "allow",
    );
    expect(staffPasswordRedirectHref("confirmPassword", "/admin/bookings")).toBe(
      "/account/admin-password?next=%2Fadmin%2Fbookings",
    );
    expect(staffPasswordRedirectHref("allow", "/admin")).toBeNull();
  });
});
