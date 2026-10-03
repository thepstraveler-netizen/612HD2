import { describe, expect, it } from "vitest";
import {
  aalFromAccessToken,
  decideMfa,
  hasVerifiedFactor,
  mfaRedirectHref,
  qrImageSrc,
  verifiedTotpFactors,
} from "@/lib/mfa/policy";
import { mfaCodeSchema, mfaVerifySchema } from "@/schemas/security";

const base = {
  area: "admin" as const,
  hasVerifiedFactor: false,
  currentLevel: "aal1" as const,
  requireAdminMfa: false,
};

describe("decideMfa", () => {
  it("lets staff without a factor in when the setting is off", () => {
    expect(decideMfa(base)).toBe("allow");
  });

  it("sends staff without a factor to set one up when the setting is on", () => {
    expect(decideMfa({ ...base, requireAdminMfa: true })).toBe("enrol");
  });

  it("never forces customers or vendors to enrol", () => {
    expect(decideMfa({ ...base, area: "other", requireAdminMfa: true })).toBe("allow");
  });

  it("asks anyone with a verified factor for a code on an aal1 session", () => {
    expect(decideMfa({ ...base, hasVerifiedFactor: true })).toBe("challenge");
    expect(decideMfa({ ...base, area: "other", hasVerifiedFactor: true })).toBe("challenge");
    expect(decideMfa({ ...base, hasVerifiedFactor: true, currentLevel: null })).toBe("challenge");
  });

  it("allows an aal2 session", () => {
    expect(decideMfa({ ...base, hasVerifiedFactor: true, currentLevel: "aal2", requireAdminMfa: true })).toBe(
      "allow",
    );
  });
});

describe("mfaRedirectHref", () => {
  it("keeps next for the code prompt", () => {
    expect(mfaRedirectHref("challenge", "/admin/bookings?status=confirmed")).toBe(
      "/mfa?next=%2Fadmin%2Fbookings%3Fstatus%3Dconfirmed",
    );
  });
  it("sends enrolment to the security page", () => {
    expect(mfaRedirectHref("enrol", "/admin")).toBe("/account/security?mfa=required");
  });
  it("returns null when allowed", () => {
    expect(mfaRedirectHref("allow", "/admin")).toBeNull();
  });
});

describe("factors", () => {
  const factors = [
    { id: "a", factor_type: "totp", status: "verified" },
    { id: "b", factor_type: "totp", status: "unverified" },
    { id: "c", factor_type: "phone", status: "verified" },
  ];
  it("lists verified TOTP factors only", () => {
    expect(verifiedTotpFactors(factors).map((f) => f.id)).toEqual(["a"]);
  });
  it("detects any verified factor", () => {
    expect(hasVerifiedFactor(factors)).toBe(true);
    expect(hasVerifiedFactor([factors[1]])).toBe(false);
    expect(hasVerifiedFactor(undefined)).toBe(false);
  });
});

describe("aalFromAccessToken", () => {
  const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
  it("reads the aal claim", () => {
    expect(aalFromAccessToken(token({ aal: "aal2" }))).toBe("aal2");
    expect(aalFromAccessToken(token({ aal: "aal1" }))).toBe("aal1");
  });
  it("returns null for missing, unknown or broken tokens", () => {
    expect(aalFromAccessToken(token({ aal: "aal3" }))).toBeNull();
    expect(aalFromAccessToken(token({}))).toBeNull();
    expect(aalFromAccessToken("garbage")).toBeNull();
    expect(aalFromAccessToken("a.@@@.b")).toBeNull();
    expect(aalFromAccessToken(undefined)).toBeNull();
  });
});

describe("codes", () => {
  it("accepts 6 digits, ignoring spaces", () => {
    expect(mfaCodeSchema.parse("123456")).toBe("123456");
    expect(mfaCodeSchema.parse(" 123 456 ")).toBe("123456");
  });
  it("rejects anything else", () => {
    for (const bad of ["12345", "1234567", "12a456", "", "١٢٣٤٥٦"]) {
      expect(mfaCodeSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(mfaVerifySchema.safeParse({ factorId: "", code: "123456" }).success).toBe(false);
  });
  it("builds a data URL for the QR code", () => {
    expect(qrImageSrc("data:image/svg+xml;utf-8,<svg/>")).toBe("data:image/svg+xml;utf-8,<svg/>");
    expect(qrImageSrc("<svg/>")).toBe("data:image/svg+xml;utf-8,%3Csvg%2F%3E");
  });
});
