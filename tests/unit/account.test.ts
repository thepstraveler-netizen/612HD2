import { describe, expect, it } from "vitest";
import { isActiveAccountLink } from "@/lib/account/nav";
import { canUseCoupon, evaluateCoupon, type Coupon, type CouponContext } from "@/lib/coupons/engine";
import {
  earnPercent,
  ledgerLabelKey,
  parseLoyaltySettings,
  pointsToPaise,
  redeemBounds,
  rewardCodeFromNote,
  toRedeemError,
  validateRedeem,
} from "@/lib/loyalty/rules";
import {
  buildReferralLink,
  firstName,
  parseRefCode,
  refCodeFromCookieHeader,
  toClaimError,
  whatsappShareUrl,
} from "@/lib/referrals/link";
import { loginHrefFor, wishlistKey } from "@/lib/wishlist/types";
import { isValidBirthDate, profileSchema, redeemSchema, travellerSchema } from "@/schemas/account";

const settings = parseLoyaltySettings({
  enabled: true,
  point_value_paise: 100,
  earn_bps: 100,
  min_redeem_points: 100,
  max_redeem_points: 2000,
  code_valid_days: 30,
  expiry_days: 365,
});

describe("loyalty settings", () => {
  it("fills defaults and treats a missing setting as switched off", () => {
    const s = parseLoyaltySettings(undefined);
    expect(s.enabled).toBe(false);
    expect(s.point_value_paise).toBe(100);
    expect(s.max_redeem_points).toBeNull();
  });

  it("falls back to defaults on a malformed setting", () => {
    expect(parseLoyaltySettings({ point_value_paise: "lots" }).point_value_paise).toBe(100);
  });
});

describe("points maths", () => {
  it("converts points to paise with the configured value", () => {
    expect(pointsToPaise(250, settings)).toBe(25_000);
    expect(pointsToPaise(250, { point_value_paise: 50 })).toBe(12_500);
    expect(pointsToPaise(-5, settings)).toBe(0);
    expect(pointsToPaise(10.9, settings)).toBe(1_000);
  });

  it("turns basis points into a percent", () => {
    expect(earnPercent(100)).toBe(1);
    expect(earnPercent(250)).toBe(2.5);
  });

  it("caps the redeem range by the balance and the maximum", () => {
    expect(redeemBounds(5000, settings)).toEqual({ min: 100, max: 2000, step: 1, canRedeem: true });
    expect(redeemBounds(450, settings)).toEqual({ min: 100, max: 450, step: 1, canRedeem: true });
    expect(redeemBounds(60, settings).canRedeem).toBe(false);
    expect(redeemBounds(700, { min_redeem_points: 1, max_redeem_points: null }).max).toBe(700);
  });
});

describe("redeem validation", () => {
  it.each([
    [150, 500, null],
    [99, 500, "below_minimum"],
    [2001, 5000, "above_maximum"],
    [400, 300, "insufficient_points"],
    [0, 300, "invalid"],
    [12.5, 300, "invalid"],
  ] as const)("%d points with %d balance → %s", (points, balance, expected) => {
    expect(validateRedeem(points, balance, settings)).toBe(expected);
  });

  it("refuses while the programme is off", () => {
    expect(validateRedeem(150, 500, { ...settings, enabled: false })).toBe("loyalty_disabled");
  });

  it("maps database exceptions", () => {
    expect(toRedeemError("insufficient_points")).toBe("insufficient_points");
    expect(toRedeemError("P0001: below_minimum")).toBe("below_minimum");
    expect(toRedeemError("connection reset")).toBe("unknown");
    expect(toRedeemError(undefined)).toBe("unknown");
  });

  it("parses the points input", () => {
    expect(redeemSchema.parse({ points: "300" })).toEqual({ points: 300 });
    expect(redeemSchema.safeParse({ points: "1.5" }).success).toBe(false);
    expect(redeemSchema.safeParse({ points: "-3" }).success).toBe(false);
    expect(redeemSchema.safeParse({ points: "abc" }).success).toBe(false);
  });
});

describe("ledger labels", () => {
  it("labels each kind and splits staff adjustments by sign", () => {
    expect(ledgerLabelKey("earn", 120)).toBe("earn");
    expect(ledgerLabelKey("redeem", -100)).toBe("redeem");
    expect(ledgerLabelKey("adjust", 50)).toBe("adjustCredit");
    expect(ledgerLabelKey("adjust", -50)).toBe("adjustDebit");
  });

  it("reads the reward code from a redeem note", () => {
    expect(rewardCodeFromNote("Reward code PSR1A2B3C4D")).toBe("PSR1A2B3C4D");
    expect(rewardCodeFromNote("Points expired")).toBeNull();
    expect(rewardCodeFromNote(null)).toBeNull();
  });
});

describe("referral links", () => {
  it("normalises codes and rejects anything else", () => {
    expect(parseRefCode(" ab12cd34 ")).toBe("AB12CD34");
    expect(parseRefCode("AB1")).toBeNull();
    expect(parseRefCode("AB12CD34<script>")).toBeNull();
    expect(parseRefCode("ABCDEFGHIJKLM")).toBeNull();
    expect(parseRefCode(null)).toBeNull();
  });

  it("reads the cookie from a Cookie header", () => {
    expect(refCodeFromCookieHeader("a=1; ps_ref=ab12cd34; b=2")).toBe("AB12CD34");
    expect(refCodeFromCookieHeader("ps_ref=bad!")).toBeNull();
    expect(refCodeFromCookieHeader("other=AB12CD34")).toBeNull();
    expect(refCodeFromCookieHeader("ps_ref=%E0%A4")).toBeNull();
    expect(refCodeFromCookieHeader(undefined)).toBeNull();
  });

  it("builds English and Hindi share links", () => {
    expect(buildReferralLink("https://pstraveler.in/", "en", "AB12CD34")).toBe(
      "https://pstraveler.in/?ref=AB12CD34",
    );
    expect(buildReferralLink("https://pstraveler.in", "hi", "AB12CD34")).toBe(
      "https://pstraveler.in/hi?ref=AB12CD34",
    );
  });

  it("builds a WhatsApp share URL", () => {
    expect(whatsappShareUrl("Join me: https://x.in/?ref=AB12CD34")).toBe(
      "https://wa.me/?text=Join%20me%3A%20https%3A%2F%2Fx.in%2F%3Fref%3DAB12CD34",
    );
  });

  it("shows only a first name", () => {
    expect(firstName("  Radha Krishna Sharma ")).toBe("Radha");
    expect(firstName("")).toBeNull();
    expect(firstName(null)).toBeNull();
  });

  it("maps claim exceptions", () => {
    expect(toClaimError("self_referral")).toBe("self_referral");
    expect(toClaimError("boom")).toBe("unknown");
  });
});

describe("personal coupons", () => {
  const coupon: Coupon = {
    id: "c",
    code: "PSR1A2B3C4D",
    discountType: "flat",
    value: 20_000,
    maxDiscountPaise: null,
    minOrderPaise: 20_000,
    services: [],
    hotelIds: [],
    startsAt: null,
    endsAt: null,
    usageLimit: 1,
    perUserLimit: 1,
    firstBookingOnly: false,
    isActive: true,
    ownerId: "owner",
  };
  const ctx = (userId: string | null): CouponContext => ({
    service: "hotel",
    hotelId: "h1",
    basePaise: 300_000,
    now: new Date("2026-10-01T10:00:00Z"),
    usedCount: 0,
    userUsedCount: 0,
    userHasPriorBooking: false,
    userId,
  });

  it("works only for its owner", () => {
    expect(canUseCoupon("owner", "owner")).toBe(true);
    expect(canUseCoupon("owner", "someone-else")).toBe(false);
    expect(canUseCoupon("owner", null)).toBe(false);
    expect(canUseCoupon(null, null)).toBe(true);
    expect(canUseCoupon(undefined, "anyone")).toBe(true);
  });

  it("is reported as not found for guests and other customers", () => {
    expect(evaluateCoupon(coupon, ctx("owner"))).toEqual({ ok: true, discountPaise: 20_000 });
    expect(evaluateCoupon(coupon, ctx("someone-else"))).toEqual({ ok: false, reason: "not_found" });
    expect(evaluateCoupon(coupon, ctx(null))).toEqual({ ok: false, reason: "not_found" });
  });

  it("leaves ordinary coupons open to everyone", () => {
    expect(evaluateCoupon({ ...coupon, ownerId: null }, ctx(null)).ok).toBe(true);
  });
});

describe("account schemas", () => {
  it("normalises the profile", () => {
    expect(profileSchema.parse({ fullName: " Asha ", phone: "98765 43210", preferredLocale: "hi" })).toEqual({
      fullName: "Asha",
      phone: "+919876543210",
      preferredLocale: "hi",
    });
    expect(profileSchema.parse({ fullName: "Asha", phone: "", preferredLocale: "en" }).phone).toBeNull();
    expect(profileSchema.safeParse({ fullName: "A", phone: "", preferredLocale: "en" }).success).toBe(false);
    expect(profileSchema.safeParse({ fullName: "Asha", phone: "123", preferredLocale: "en" }).success).toBe(
      false,
    );
    expect(profileSchema.safeParse({ fullName: "Asha", phone: "", preferredLocale: "fr" }).success).toBe(
      false,
    );
  });

  it("turns blank traveller fields into nulls", () => {
    expect(
      travellerSchema.parse({
        fullName: "Gopal Das",
        relation: "",
        dateOfBirth: "",
        gender: "",
        phone: "",
      }),
    ).toEqual({
      fullName: "Gopal Das",
      relation: null,
      dateOfBirth: null,
      gender: null,
      phone: null,
      isDefault: false,
    });
  });

  it("validates traveller details", () => {
    const base = { fullName: "Gopal Das", relation: "Father", gender: "male", phone: "9876543210" };
    expect(travellerSchema.parse({ ...base, dateOfBirth: "1960-05-04", isDefault: true })).toMatchObject({
      dateOfBirth: "1960-05-04",
      gender: "male",
      phone: "+919876543210",
      isDefault: true,
    });
    expect(travellerSchema.safeParse({ ...base, dateOfBirth: "1960-02-30" }).success).toBe(false);
    expect(travellerSchema.safeParse({ ...base, dateOfBirth: "", gender: "x" }).success).toBe(false);
    expect(travellerSchema.safeParse({ ...base, dateOfBirth: "", relation: "x".repeat(41) }).success).toBe(
      false,
    );
  });

  it("accepts only past birth dates after 1900", () => {
    const today = new Date("2026-10-03T12:00:00Z");
    expect(isValidBirthDate("2026-10-03", today)).toBe(true);
    expect(isValidBirthDate("2026-10-04", today)).toBe(false);
    expect(isValidBirthDate("1900-01-01", today)).toBe(false);
    expect(isValidBirthDate("04-05-1960", today)).toBe(false);
  });
});

describe("wishlist and navigation helpers", () => {
  it("keys items and builds a safe login link", () => {
    expect(wishlistKey("hotel", "abc")).toBe("hotel:abc");
    expect(loginHrefFor("/hi/hotels?q=Vrindavan")).toBe("/login?next=%2Fhi%2Fhotels%3Fq%3DVrindavan");
    expect(loginHrefFor("//evil.example")).toBe("/login?next=%2F");
  });

  it("marks the current account section", () => {
    expect(isActiveAccountLink("/account", "/account")).toBe(true);
    expect(isActiveAccountLink("/account/rewards", "/account")).toBe(false);
    expect(isActiveAccountLink("/account/trips/PS123", "/account/trips")).toBe(true);
    expect(isActiveAccountLink("/account/tripsx", "/account/trips")).toBe(false);
  });
});
