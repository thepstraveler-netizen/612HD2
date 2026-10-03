import { describe, expect, it } from "vitest";
import { assembleExport, EXPORT_COLUMNS, exportFileName, type ExportSources } from "@/lib/privacy/assemble";
import { privacyRpcError } from "@/lib/privacy/rows";
import { completeDeletionSchema, deletionRequestSchema, rejectPrivacyRequestSchema } from "@/schemas/privacy";

const USER = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const T = "2026-10-01T10:00:00.000Z";

function sources(over: Partial<ExportSources> = {}): ExportSources {
  return {
    profile: {
      id: USER,
      email: "priya@example.com",
      full_name: "Priya Sharma",
      phone: "+919800000000",
      avatar_url: null,
      preferred_locale: "en",
      referral_code: "AB12CD34",
      created_at: T,
      updated_at: T,
    },
    addresses: [],
    travellers: [],
    wishlists: [{ subject_type: "hotel", subject_id: "h1", created_at: T }],
    bookings: [
      {
        id: "b1",
        code: "PS1",
        service: "hotel",
        status: "completed",
        check_in: "2026-09-01",
        check_out: "2026-09-02",
        rooms: 1,
        adults: 2,
        children: 0,
        contact_name: "Priya",
        contact_email: null,
        contact_phone: "+919800000000",
        special_requests: null,
        gst_details: null,
        subtotal_paise: 100000,
        discount_paise: 0,
        tax_paise: 12000,
        total_paise: 112000,
        paid_paise: 112000,
        refunded_paise: 0,
        payment_mode: "full",
        coupon_code: null,
        locale: "en",
        confirmed_at: T,
        completed_at: T,
        cancelled_at: null,
        cancel_reason: null,
        created_at: T,
      },
    ] as ExportSources["bookings"],
    bookingItems: [
      {
        booking_id: "b1",
        kind: "fee",
        description: "Fee",
        service_date: null,
        quantity: 1,
        amount_paise: 2000,
        discount_paise: 0,
        tax_rate_bps: 1800,
        tax_paise: 360,
        sac: null,
        sort_order: 2,
      },
      {
        booking_id: "b1",
        kind: "room",
        description: "Deluxe",
        service_date: "2026-09-01",
        quantity: 1,
        amount_paise: 98000,
        discount_paise: 0,
        tax_rate_bps: 1200,
        tax_paise: 11640,
        sac: "996311",
        sort_order: 1,
      },
      {
        booking_id: "other",
        kind: "room",
        description: "Not mine",
        service_date: null,
        quantity: 1,
        amount_paise: 1,
        discount_paise: 0,
        tax_rate_bps: 0,
        tax_paise: 0,
        sac: null,
        sort_order: 1,
      },
    ],
    bookingGuests: [
      { booking_id: "b1", full_name: "Priya", is_child: false, is_primary: true, sort_order: 0 },
    ],
    payments: [
      {
        booking_id: "b1",
        provider: "razorpay",
        amount_paise: 112000,
        status: "captured",
        method: "upi",
        captured_at: T,
        created_at: T,
      },
    ] as ExportSources["payments"],
    refunds: [],
    orders: [
      {
        id: "o1",
        booking_id: "b1",
        kind: "restaurant",
        address: {},
        status: "delivered",
        placed_at: T,
        delivered_at: T,
        rating: 5,
        rating_comment: null,
        rated_at: T,
        created_at: T,
      },
    ] as ExportSources["orders"],
    orderItems: [
      {
        order_id: "o1",
        name: "Thali",
        variant_name: null,
        addons: [],
        quantity: 2,
        unit_price_paise: 15000,
        line_total_paise: 30000,
        sort_order: 0,
      },
    ],
    prescriptions: [
      {
        id: "p1",
        patient_name: "Priya",
        patient_age: 30,
        phone: "+919800000000",
        address: {},
        files: ["prescriptions/u/a.jpg", "prescriptions/u/b.jpg"],
        notes: null,
        status: "submitted",
        created_at: T,
        updated_at: T,
      },
    ] as ExportSources["prescriptions"],
    reviews: [],
    loyaltyLedger: [
      { kind: "earn", points: 120, booking_id: "b1", note: null, expires_at: null, created_at: T },
      { kind: "redeem", points: -20, booking_id: null, note: null, expires_at: null, created_at: T },
    ] as ExportSources["loyaltyLedger"],
    referrals: [
      {
        referrer_id: USER,
        referee_id: FRIEND,
        code: "AB12CD34",
        status: "rewarded",
        rewarded_at: T,
        created_at: T,
      },
    ] as ExportSources["referrals"],
    leads: [],
    partnerApplications: [
      {
        number: 7,
        business_type: "hotel",
        business_name: "Ganga View",
        contact_name: "Priya",
        phone: "+919800000000",
        email: "priya@example.com",
        city: "Varanasi",
        address: "Ghat road",
        gstin: null,
        pan: null,
        website: null,
        details: {},
        message: null,
        documents: [
          {
            kind: "gst",
            path: `partners/${USER}/x.pdf`,
            name: "gst.pdf",
            mime_type: "application/pdf",
            size: 10,
          },
        ],
        agreement_version: "1",
        agreement_name: "Priya",
        agreement_accepted_at: T,
        status: "submitted",
        review_note: null,
        reviewed_at: null,
        created_at: T,
      },
    ] as ExportSources["partnerApplications"],
    privacyRequests: [],
    ...over,
  };
}

describe("assembleExport", () => {
  const out = assembleExport(USER, sources(), new Date(T));
  const text = JSON.stringify(out);

  it("nests items, guests, payments and orders under their own booking, in order", () => {
    expect(out.bookings).toHaveLength(1);
    const b = out.bookings[0];
    expect(b.items.map((i) => i.description)).toEqual(["Deluxe", "Fee"]);
    expect(b.guests).toEqual([{ full_name: "Priya", is_child: false, is_primary: true }]);
    expect(b.payments).toEqual([
      {
        provider: "razorpay",
        amount_paise: 112000,
        status: "captured",
        method: "upi",
        captured_at: T,
        created_at: T,
      },
    ]);
    expect(b.orders[0].items[0]).toMatchObject({ name: "Thali", quantity: 2 });
    expect(text).not.toContain("Not mine");
  });

  it("leaves out storage paths and the other person in a referral", () => {
    expect(out.prescriptions[0]).not.toHaveProperty("files");
    expect(out.prescriptions[0].file_count).toBe(2);
    expect(out.partner_applications[0].documents).toEqual([{ kind: "gst", name: "gst.pdf" }]);
    expect(text).not.toContain("partners/");
    expect(text).not.toContain("prescriptions/u/");
    expect(out.referrals).toEqual([
      { role: "referrer", code: "AB12CD34", status: "rewarded", rewarded_at: T, created_at: T },
    ]);
    expect(text).not.toContain(FRIEND);
  });

  it("sums the points and stamps the file", () => {
    expect(out.points_balance).toBe(100);
    expect(out.generated_at).toBe(T);
    expect(out.user_id).toBe(USER);
    expect(out.wishlist).toHaveLength(1);
    expect(exportFileName(new Date(T))).toBe("ps-traveler-data-2026-10-01.json");
  });

  it("never selects gateway secrets, tokens, OTPs or staff ids", () => {
    const all = Object.values(EXPORT_COLUMNS).join(",");
    for (const column of [
      "raw",
      "provider_order_id",
      "provider_payment_id",
      "partner_token",
      "delivery_otp",
      "assigned_to",
      "reviewed_by",
      "moderated_by",
      "moderation_note",
      "created_by",
      "processed_by",
      "price_breakdown",
      "snapshot",
    ]) {
      expect(all.split(/,\s*/), column).not.toContain(column);
    }
  });

  it("handles an account with nothing yet", () => {
    const empty = assembleExport(
      USER,
      sources({
        bookings: [],
        bookingItems: [],
        bookingGuests: [],
        payments: [],
        orders: [],
        orderItems: [],
        prescriptions: [],
        loyaltyLedger: [],
        referrals: [],
        partnerApplications: [],
        wishlists: [],
      }),
      new Date(T),
    );
    expect(empty.bookings).toEqual([]);
    expect(empty.points_balance).toBe(0);
  });
});

describe("privacy schemas", () => {
  it("needs the confirm tick to request deletion", () => {
    expect(deletionRequestSchema.safeParse({ reason: "", confirm: false }).success).toBe(false);
    expect(deletionRequestSchema.parse({ confirm: true })).toEqual({ reason: "", confirm: true });
    expect(deletionRequestSchema.safeParse({ reason: "x".repeat(1001), confirm: true }).success).toBe(false);
  });
  it("needs a reason to reject", () => {
    const id = USER;
    expect(rejectPrivacyRequestSchema.safeParse({ id, note: "  " }).success).toBe(false);
    expect(rejectPrivacyRequestSchema.safeParse({ id, note: "Unpaid invoice" }).success).toBe(true);
    expect(completeDeletionSchema.parse({ id })).toEqual({ id, note: "" });
    expect(completeDeletionSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
  it("maps SQL errors", () => {
    expect(privacyRpcError("already_requested")).toBe("alreadyRequested");
    expect(privacyRpcError("reason_required")).toBe("reasonRequired");
    expect(privacyRpcError("boom")).toBeNull();
  });
});
