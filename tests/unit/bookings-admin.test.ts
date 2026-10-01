import { describe, expect, it } from "vitest";
import {
  availableBookingActions,
  bookingFiltersQuery,
  bookingSearchFilter,
  bpsToPercentInput,
  couponFormValues,
  couponRow,
  couponUsage,
  couponValueLabel,
  EMPTY_COUPON_FORM,
  invoiceSettingsFormValues,
  mergeSettingValue,
  parseBookingFilters,
  paymentSettingsFormValues,
  paymentSettingsValue,
  readSnapshot,
  refundable,
  samplePlaceholderValues,
  searchTerm,
  suggestedRefund,
} from "@/lib/bookings/admin-forms";
import type { PermissionKey } from "@/lib/permissions/constants";
import { BOOKING_PLACEHOLDERS, renderTemplate } from "@/lib/notifications/render";
import { invoiceSettingsSchema, paymentSettingsSchema } from "@/schemas/booking";
import {
  cancelBookingSchema,
  couponFormSchema,
  invoiceSettingsFormSchema,
  offlinePaymentSchema,
  paymentSettingsFormSchema,
  refundBookingSchema,
  templateFormSchema,
  type CouponFormInput,
} from "@/schemas/booking-admin";
import type { Tables } from "@/types/database";

const BOOKING = "11111111-1111-4111-8111-111111111111";
const HOTEL = "22222222-2222-4222-8222-222222222222";
const COUPON = "33333333-3333-4333-8333-333333333333";

function coupon(overrides: Partial<CouponFormInput> = {}) {
  return couponFormSchema.parse({ ...EMPTY_COUPON_FORM, code: "radhe10", value: "10", ...overrides });
}

describe("bookings list filters", () => {
  it("reads valid filters and drops invalid ones one by one", () => {
    expect(
      parseBookingFilters({
        status: "confirmed",
        service: "spaceship",
        from: "2026-10-01",
        to: "2026-13-01",
        q: "  radha ",
        page: "3",
      }),
    ).toEqual({ status: "confirmed", from: "2026-10-01", q: "radha", page: 3 });
  });

  it("defaults to page 1 and ignores empty and repeated params", () => {
    expect(parseBookingFilters({ status: "", page: "0", q: ["a1", "b2"] })).toEqual({ q: "a1", page: 1 });
  });

  it("swaps a reversed check-in range", () => {
    const f = parseBookingFilters({ from: "2026-11-30", to: "2026-11-01" });
    expect([f.from, f.to]).toEqual(["2026-11-01", "2026-11-30"]);
  });

  it("builds the query string for pagination links", () => {
    const f = parseBookingFilters({ status: "cancelled", q: "PS7K", page: "2" });
    expect(bookingFiltersQuery(f, 3)).toBe("?status=cancelled&q=PS7K&page=3");
    expect(bookingFiltersQuery(f, 1)).toBe("?status=cancelled&q=PS7K");
    expect(bookingFiltersQuery({})).toBe("");
  });

  it("strips PostgREST filter syntax from free text", () => {
    expect(searchTerm("radha),status.eq.(draft")).toBe("radha status eq draft");
    expect(searchTerm("*%")).toBeNull();
    expect(searchTerm(undefined)).toBeNull();
  });

  it("searches code, name and (for digits) phone", () => {
    expect(bookingSearchFilter("ps7k")).toBe("code.ilike.*PS7K*,contact_name.ilike.*ps7k*");
    expect(bookingSearchFilter("98765 43210")).toContain("contact_phone.ilike.*9876543210*");
  });
});

describe("booking actions", () => {
  const all = () => true;
  const only =
    (...perms: PermissionKey[]) =>
    (p: PermissionKey) =>
      perms.includes(p);
  const booking = (overrides: Partial<Tables<"bookings">> = {}) =>
    ({
      status: "confirmed",
      total_paise: 500_000,
      paid_paise: 125_000,
      refunded_paise: 0,
      ...overrides,
    }) as Tables<"bookings">;

  it("offers everything valid for a part-paid confirmed booking", () => {
    expect(availableBookingActions(booking(), all, { paymentLinks: true })).toEqual([
      "cancel",
      "refund",
      "complete",
      "offlinePayment",
      "paymentLink",
      "resendConfirmation",
    ]);
  });

  it("hides the payment link when Razorpay is not configured or nothing is due", () => {
    expect(availableBookingActions(booking(), all, { paymentLinks: false })).not.toContain("paymentLink");
    const paid = availableBookingActions(booking({ paid_paise: 500_000 }), all, { paymentLinks: true });
    expect(paid).not.toContain("paymentLink");
    expect(paid).not.toContain("offlinePayment");
  });

  it("follows the state machine", () => {
    expect(
      availableBookingActions(booking({ status: "pending_payment", paid_paise: 0 }), all, {
        paymentLinks: true,
      }),
    ).toEqual(["cancel"]);
    expect(
      availableBookingActions(booking({ status: "cancelled", paid_paise: 125_000 }), all, {
        paymentLinks: true,
      }),
    ).toEqual(["refund"]);
    expect(
      availableBookingActions(booking({ status: "refunded", refunded_paise: 125_000 }), all, {
        paymentLinks: true,
      }),
    ).toEqual([]);
    expect(availableBookingActions(booking({ status: "completed" }), all, { paymentLinks: true })).toEqual([
      "refund",
      "offlinePayment",
      "paymentLink",
      "resendConfirmation",
    ]);
  });

  it("follows the viewer's permissions", () => {
    expect(availableBookingActions(booking(), only("bookings.write"), { paymentLinks: true })).toEqual([
      "cancel",
      "complete",
      "resendConfirmation",
    ]);
    expect(availableBookingActions(booking(), only("payments.refund"), { paymentLinks: true })).toEqual([
      "refund",
    ]);
    expect(availableBookingActions(booking(), only("bookings.read"), { paymentLinks: true })).toEqual([]);
  });

  it("refundable is what was paid minus earlier refunds", () => {
    expect(refundable({ paid_paise: 300_000, refunded_paise: 100_000 })).toBe(200_000);
    expect(refundable({ paid_paise: 0, refunded_paise: 0 })).toBe(0);
  });

  it("suggests the policy refund from the booking snapshot", () => {
    const b = {
      status: "confirmed",
      total_paise: 400_000,
      paid_paise: 400_000,
      refunded_paise: 0,
      check_in: "2026-11-14",
      snapshot: {
        hotel: { name: { en: "Shri Krishna Dham" }, checkInTime: "12:00:00" },
        plan: { isRefundable: true, cancellationRules: [{ hours_before: 48, refund_percent: 100 }] },
      },
    } as unknown as Tables<"bookings">;
    // 12:00 IST on 14 Nov = 06:30 UTC; three days before → full refund.
    expect(suggestedRefund(b, new Date("2026-11-11T06:30:00Z"))).toMatchObject({
      percent: 100,
      refundPaise: 400_000,
      hoursBefore: 72,
    });
    // One day before: inside the 48-hour window, nothing refundable.
    expect(suggestedRefund(b, new Date("2026-11-13T06:30:00Z")).refundPaise).toBe(0);
  });

  it("suggests nothing for a non-refundable or unreadable snapshot", () => {
    const b = {
      status: "confirmed",
      total_paise: 400_000,
      paid_paise: 400_000,
      refunded_paise: 0,
      check_in: "2026-11-14",
      snapshot: "garbage",
    } as unknown as Tables<"bookings">;
    expect(readSnapshot(b.snapshot)).toEqual({});
    expect(suggestedRefund(b, new Date("2026-10-01T00:00:00Z")).refundPaise).toBe(0);
  });

  it("validates action input: reason required, rupees → paise", () => {
    expect(
      cancelBookingSchema.parse({ bookingId: BOOKING, reason: "Guest asked", refund: "1,250.50" }),
    ).toEqual({
      bookingId: BOOKING,
      reason: "Guest asked",
      refund: 125_050,
    });
    expect(cancelBookingSchema.parse({ bookingId: BOOKING, reason: "Guest asked", refund: "" }).refund).toBe(
      0,
    );
    expect(cancelBookingSchema.safeParse({ bookingId: BOOKING, reason: "", refund: "0" }).success).toBe(
      false,
    );
    expect(
      refundBookingSchema.safeParse({ bookingId: BOOKING, reason: "Goodwill", amount: "0" }).success,
    ).toBe(false);
    expect(
      refundBookingSchema.safeParse({ bookingId: BOOKING, reason: "Goodwill", amount: "12.345" }).success,
    ).toBe(false);
    expect(
      offlinePaymentSchema.parse({ bookingId: BOOKING, amount: "500", method: "upi", reference: " " }),
    ).toEqual({ bookingId: BOOKING, amount: 50_000, method: "upi", reference: null });
    expect(
      offlinePaymentSchema.safeParse({ bookingId: BOOKING, amount: "500", method: "cheque" }).success,
    ).toBe(false);
  });
});

describe("coupon form ↔ row", () => {
  it("stores percent as basis points and rupees as paise", () => {
    const row = couponRow(coupon({ value: "12.5", max_discount: "500", min_order: "1,999.50" }));
    expect(row).toMatchObject({
      code: "RADHE10",
      discount_type: "percent",
      value: 1250,
      max_discount_paise: 50_000,
      min_order_paise: 199_950,
      usage_limit: null,
      per_user_limit: 1,
      description: null,
    });
  });

  it("stores a flat discount in paise and drops the cap", () => {
    const row = couponRow(coupon({ discount_type: "flat", value: "₹250", max_discount: "500" }));
    expect(row).toMatchObject({ discount_type: "flat", value: 25_000, max_discount_paise: null });
  });

  it("keeps scope, limits and dates", () => {
    const row = couponRow(
      coupon({
        services: ["hotel", "hotel", "cab"],
        hotel_ids: [HOTEL],
        usage_limit: "100",
        per_user_limit: "2",
        starts_at: "2026-10-01T00:00:00.000Z",
        ends_at: "2026-10-31T18:29:59.000Z",
        description: { en: "Diwali offer", hi: "" },
        first_booking_only: true,
        is_public: true,
      }),
    );
    expect(row).toMatchObject({
      services: ["hotel", "cab"],
      hotel_ids: [HOTEL],
      usage_limit: 100,
      per_user_limit: 2,
      starts_at: "2026-10-01T00:00:00.000Z",
      ends_at: "2026-10-31T18:29:59.000Z",
      description: { en: "Diwali offer", hi: null },
      first_booking_only: true,
      is_public: true,
    });
  });

  it("rejects bad codes, values and date ranges", () => {
    const bad = (o: Partial<CouponFormInput>) =>
      couponFormSchema.safeParse({ ...EMPTY_COUPON_FORM, code: "OK10", value: "10", ...o });
    expect(bad({ code: "no spaces" }).success).toBe(false);
    expect(bad({ code: "AB" }).success).toBe(false);
    expect(bad({ value: "0" }).success).toBe(false);
    expect(bad({ value: "101" }).success).toBe(false);
    expect(bad({ value: "10.123" }).success).toBe(false);
    expect(bad({ discount_type: "flat", value: "abc" }).success).toBe(false);
    expect(bad({ max_discount: "0" }).success).toBe(false);
    expect(bad({ usage_limit: "0" }).success).toBe(false);
    const range = bad({ starts_at: "2026-10-10T00:00:00Z", ends_at: "2026-10-01T00:00:00Z" });
    expect(range.success).toBe(false);
    expect(range.error?.issues[0]).toMatchObject({ message: "endBeforeStart", path: ["ends_at"] });
  });

  it("round-trips a stored coupon through the form", () => {
    const stored = {
      id: COUPON,
      code: "FLAT250",
      description: { en: "₹250 off", hi: null },
      discount_type: "flat",
      value: 25_050,
      max_discount_paise: null,
      min_order_paise: 0,
      services: ["hotel"],
      hotel_ids: [],
      starts_at: null,
      ends_at: "2026-12-31T18:30:00.000Z",
      usage_limit: 50,
      per_user_limit: 1,
      first_booking_only: false,
      is_public: true,
      is_active: true,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    } satisfies Tables<"coupons">;
    const form = couponFormValues(stored);
    expect(form).toMatchObject({ value: "250.50", min_order: "", usage_limit: "50", starts_at: "" });
    const row = couponRow(couponFormSchema.parse(form));
    expect(row).toMatchObject({
      code: stored.code,
      value: stored.value,
      min_order_paise: 0,
      usage_limit: 50,
      starts_at: null,
      ends_at: stored.ends_at,
    });
  });

  it("formats basis points and list labels", () => {
    expect(bpsToPercentInput(1000)).toBe("10");
    expect(bpsToPercentInput(1250)).toBe("12.5");
    expect(bpsToPercentInput(333)).toBe("3.33");
    expect(
      couponValueLabel({ discount_type: "percent", value: 1500, max_discount_paise: 50_000 }, "en"),
    ).toEqual({
      value: "15%",
      cap: "₹500",
    });
    expect(
      couponValueLabel({ discount_type: "flat", value: 19_950, max_discount_paise: null }, "en"),
    ).toEqual({
      value: "₹199.50",
      cap: null,
    });
  });

  it("counts reserved and redeemed uses, not released ones", () => {
    const usage = couponUsage([
      { coupon_id: "a", status: "redeemed" },
      { coupon_id: "a", status: "reserved" },
      { coupon_id: "a", status: "released" },
      { coupon_id: "b", status: "released" },
    ]);
    expect(usage.get("a")).toBe(2);
    expect(usage.get("b")).toBeUndefined();
  });
});

describe("notification templates", () => {
  const base = {
    key: "booking.confirmed",
    channel: "email",
    locale: "en",
    subject: "Hi",
    body: "Hello",
    is_active: true,
  };

  it("requires a subject for email only, and drops it elsewhere", () => {
    expect(templateFormSchema.safeParse({ ...base, subject: "" }).success).toBe(false);
    expect(templateFormSchema.parse({ ...base, channel: "sms", subject: "ignored" }).subject).toBeNull();
    expect(templateFormSchema.safeParse({ ...base, key: "Booking Confirmed" }).success).toBe(false);
    expect(templateFormSchema.safeParse({ ...base, body: "  " }).success).toBe(false);
  });

  it("has a sample value for every booking placeholder", () => {
    for (const locale of ["en", "hi"] as const) {
      const values = samplePlaceholderValues(locale, "https://example.com/");
      for (const p of BOOKING_PLACEHOLDERS) expect(values[p], p).toBeTruthy();
      expect(values.trip_url).toBe(
        locale === "hi"
          ? "https://example.com/hi/account/trips/PS7K3Q9XD2"
          : "https://example.com/account/trips/PS7K3Q9XD2",
      );
    }
    expect(renderTemplate("{{code}} · {{total}}", samplePlaceholderValues("en", "https://x.in"))).toBe(
      "PS7K3Q9XD2 · ₹5,600",
    );
  });
});

describe("checkout settings forms", () => {
  it("maps the payment form to the stored shape (paise, bps) and back", () => {
    const form = paymentSettingsFormSchema.parse({
      advance_percent: "30",
      part_payment_enabled: true,
      convenience_fee: "49.50",
      fee_tax_percent: "18",
      pay_at_hotel_enabled: false,
      hold_minutes: "20",
      customer_cancellation_enabled: true,
    });
    const value = paymentSettingsValue(form);
    expect(value).toEqual({
      advance_percent: 30,
      part_payment_enabled: true,
      convenience_fee_paise: 4950,
      fee_tax_bps: 1800,
      pay_at_hotel_enabled: false,
      hold_minutes: 20,
      customer_cancellation_enabled: true,
    });
    expect(paymentSettingsSchema.parse(value)).toEqual(value);
    expect(paymentSettingsFormValues(value)).toMatchObject({
      convenience_fee: "49.50",
      fee_tax_percent: "18",
    });
  });

  it("rejects values outside the stored schema's range", () => {
    const valid = paymentSettingsFormValues(paymentSettingsSchema.parse({}));
    expect(paymentSettingsFormSchema.safeParse({ ...valid, hold_minutes: 45 }).success).toBe(false);
    expect(paymentSettingsFormSchema.safeParse({ ...valid, advance_percent: 100 }).success).toBe(false);
    expect(paymentSettingsFormSchema.safeParse({ ...valid, fee_tax_percent: "101" }).success).toBe(false);
    expect(paymentSettingsFormSchema.safeParse({ ...valid, convenience_fee: "10001" }).success).toBe(false);
  });

  it("normalises the invoice form so the stored schema accepts it", () => {
    const form = invoiceSettingsFormSchema.parse({
      ...invoiceSettingsFormValues(invoiceSettingsSchema.parse({})),
      prefix: " pst ",
    });
    expect(form.prefix).toBe("PST");
    expect(invoiceSettingsSchema.safeParse(form).success).toBe(true);
    expect(invoiceSettingsFormSchema.safeParse({ ...form, sac_accommodation: "99631" }).success).toBe(false);
  });

  it("keeps stored keys the form does not edit", () => {
    expect(mergeSettingValue({ legacy: 1, hold_minutes: 15 }, { hold_minutes: 20 })).toEqual({
      legacy: 1,
      hold_minutes: 20,
    });
    expect(mergeSettingValue(null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeSettingValue([1, 2], { a: 1 })).toEqual({ a: 1 });
  });
});
