import { describe, expect, it } from "vitest";
import {
  actionError,
  addonNames,
  averageRating,
  daySummary,
  deliversItself,
  groupByStatus,
  hoursByDay,
  indiaDayStart,
  minutesSince,
  orderAddress,
  orderCash,
  RIDER_NEXT,
  riderActions,
  vendorActions,
} from "@/lib/delivery/vendor-ui";
import { isProtectedPath } from "@/lib/routing/protected";
import { menuChangeSchema, riderStepSchema, vendorMoveSchema } from "@/schemas/delivery-vendor";

const id = "7f1c2a4e-1b2c-4d3e-8f9a-0b1c2d3e4f5a";

describe("vendorActions", () => {
  const self = { selfDelivery: true, requireOtp: true };
  const rider = { selfDelivery: false, requireOtp: true };

  it("offers accept (primary) and reject with a reason on a new order", () => {
    expect(vendorActions("placed", self)).toEqual([
      { status: "accepted", primary: true, needsOtp: false, needsReason: false },
      { status: "rejected", primary: false, needsOtp: false, needsReason: true },
    ]);
  });

  it("hides out-for-delivery and delivered when a platform rider has the order", () => {
    expect(vendorActions("accepted", rider).map((a) => a.status)).toEqual(["preparing", "ready"]);
    expect(vendorActions("preparing", rider).map((a) => a.status)).toEqual(["ready"]);
    expect(vendorActions("ready", rider)).toEqual([]);
    expect(vendorActions("out_for_delivery", rider)).toEqual([]);
  });

  it("lets a store delivering itself take it out and deliver with the OTP", () => {
    expect(vendorActions("ready", self)).toEqual([
      { status: "out_for_delivery", primary: true, needsOtp: false, needsReason: false },
    ]);
    expect(vendorActions("out_for_delivery", self)).toEqual([
      { status: "delivered", primary: true, needsOtp: true, needsReason: false },
    ]);
    expect(vendorActions("out_for_delivery", { selfDelivery: true, requireOtp: false })[0].needsOtp).toBe(
      false,
    );
  });

  it("marks exactly one primary button and none for finished orders", () => {
    for (const s of ["placed", "accepted", "preparing", "ready", "out_for_delivery"] as const) {
      expect(vendorActions(s, self).filter((a) => a.primary)).toHaveLength(1);
    }
    expect(vendorActions("preparing", self).find((a) => a.primary)?.status).toBe("ready");
    expect(vendorActions("delivered", self)).toEqual([]);
    expect(vendorActions("cancelled", self)).toEqual([]);
  });
});

describe("deliversItself", () => {
  it("is true with no rider or one of the store's own", () => {
    const own = new Set(["a"]);
    expect(deliversItself(null, own)).toBe(true);
    expect(deliversItself("a", own)).toBe(true);
    expect(deliversItself("b", own)).toBe(false);
  });
});

describe("rider steps", () => {
  it("only picks up from accepted, preparing or ready, then delivers", () => {
    expect(RIDER_NEXT.placed).toBeUndefined();
    expect(riderActions("accepted", true)).toEqual([{ status: "out_for_delivery", needsOtp: false }]);
    expect(riderActions("ready", true)).toEqual([{ status: "out_for_delivery", needsOtp: false }]);
    expect(riderActions("out_for_delivery", true)).toEqual([{ status: "delivered", needsOtp: true }]);
    expect(riderActions("out_for_delivery", false)).toEqual([{ status: "delivered", needsOtp: false }]);
    expect(riderActions("delivered", true)).toEqual([]);
    expect(riderActions("rejected", true)).toEqual([]);
  });

  it("validates the token and OTP", () => {
    const token = "a".repeat(48);
    expect(riderStepSchema.safeParse({ token, status: "delivered", otp: "1234" }).success).toBe(true);
    expect(riderStepSchema.safeParse({ token, status: "delivered", otp: "12a4" }).success).toBe(false);
    expect(riderStepSchema.safeParse({ token: "A".repeat(48), status: "delivered" }).success).toBe(false);
    expect(riderStepSchema.safeParse({ token, status: "accepted" }).success).toBe(false);
  });

  it("keeps the rider link public (not under a protected prefix)", () => {
    expect(isProtectedPath("/delivery/order/abc")).toBe(false);
    expect(isProtectedPath("/vendor/orders")).toBe(true);
  });
});

describe("vendor inputs", () => {
  it("needs a reason to reject", () => {
    expect(vendorMoveSchema.safeParse({ orderId: id, status: "rejected" }).success).toBe(false);
    expect(
      vendorMoveSchema.safeParse({ orderId: id, status: "rejected", note: "Out of paneer" }).success,
    ).toBe(true);
    expect(vendorMoveSchema.safeParse({ orderId: id, status: "accepted" }).success).toBe(true);
    expect(vendorMoveSchema.safeParse({ orderId: id, status: "placed" }).success).toBe(false);
  });

  it("accepts menu changes by kind", () => {
    expect(menuChangeSchema.safeParse({ kind: "item", id, stock: null, pricePaise: 12000 }).success).toBe(
      true,
    );
    expect(menuChangeSchema.safeParse({ kind: "item", id, pricePaise: 0 }).success).toBe(false);
    expect(menuChangeSchema.safeParse({ kind: "addon", id, pricePaise: 0 }).success).toBe(true);
    expect(menuChangeSchema.safeParse({ kind: "variant", id, stock: -1 }).success).toBe(false);
  });
});

describe("groupByStatus", () => {
  it("buckets live orders oldest first and drops finished ones", () => {
    const groups = groupByStatus([
      { id: "1", status: "placed" as const, placedAt: "2026-10-02T10:05:00Z" },
      { id: "2", status: "placed" as const, placedAt: "2026-10-02T10:00:00Z" },
      { id: "3", status: "ready" as const, placedAt: "2026-10-02T09:00:00Z" },
      { id: "4", status: "delivered" as const, placedAt: "2026-10-02T08:00:00Z" },
    ]);
    expect(groups.placed.map((o) => o.id)).toEqual(["2", "1"]);
    expect(groups.ready.map((o) => o.id)).toEqual(["3"]);
    expect(groups.accepted).toEqual([]);
    expect(Object.values(groups).flat()).toHaveLength(3);
  });
});

describe("daySummary", () => {
  // 2 Oct 2026, 10:00 India time.
  const now = new Date("2026-10-02T04:30:00Z");

  it("starts the day at midnight India time", () => {
    expect(indiaDayStart(now).toISOString()).toBe("2026-10-01T18:30:00.000Z");
    expect(indiaDayStart(new Date("2026-10-01T18:29:00Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("counts today's orders, delivered revenue and pending", () => {
    const s = daySummary(
      [
        { status: "placed", placedAt: "2026-10-02T04:00:00Z", deliveredAt: null, totalPaise: 10000 },
        {
          status: "delivered",
          placedAt: "2026-10-01T18:40:00Z",
          deliveredAt: "2026-10-01T19:20:00Z",
          totalPaise: 25050,
        },
        // Placed yesterday, delivered after midnight: revenue today, not an order today.
        {
          status: "delivered",
          placedAt: "2026-10-01T18:00:00Z",
          deliveredAt: "2026-10-01T18:45:00Z",
          totalPaise: 5000,
        },
        { status: "preparing", placedAt: "2026-10-02T03:00:00Z", deliveredAt: null, totalPaise: 8000 },
        { status: "rejected", placedAt: "2026-10-02T02:00:00Z", deliveredAt: null, totalPaise: 9000 },
      ],
      now,
    );
    expect(s).toEqual({ todayCount: 4, deliveredPaise: 30050, deliveredCount: 2, pending: 1, inProgress: 1 });
  });
});

describe("money and details", () => {
  it("collects the unpaid balance at the door", () => {
    expect(orderCash({ totalPaise: 45000, paidPaise: 0, refundedPaise: 0 })).toEqual({
      collectPaise: 45000,
      paidOnlinePaise: 0,
    });
    expect(orderCash({ totalPaise: 45000, paidPaise: 45000, refundedPaise: 5000 })).toEqual({
      collectPaise: 0,
      paidOnlinePaise: 40000,
    });
  });

  it("averages ratings to one decimal", () => {
    expect(averageRating([])).toBeNull();
    expect(averageRating([5, 4, 4, null])).toBe(4.3);
    expect(averageRating([0, 6, 3])).toBe(3);
  });

  it("minutes since placed never goes negative", () => {
    expect(minutesSince("2026-10-02T10:00:00Z", Date.parse("2026-10-02T10:07:59Z"))).toBe(7);
    expect(minutesSince("2026-10-02T10:00:00Z", Date.parse("2026-10-02T09:00:00Z"))).toBe(0);
    expect(minutesSince(null, 0)).toBe(0);
  });

  it("reads the order address and add-ons leniently", () => {
    expect(
      orderAddress({
        contact_name: "Asha",
        phone: "9876543210",
        line1: "12 Gali",
        line2: "",
        landmark: " Temple ",
        pincode: "281121",
      }),
    ).toEqual({
      name: "Asha",
      phone: "9876543210",
      text: "12 Gali, 281121",
      landmark: "Temple",
      lat: null,
      lng: null,
    });
    expect(orderAddress("nope").text).toBe("");
    expect(addonNames([{ name: "Extra butter", price_paise: 2000 }])).toEqual(["Extra butter"]);
    expect(addonNames(null)).toEqual([]);
  });

  it("groups opening hours by weekday", () => {
    const days = hoursByDay([
      { day: 1, open: "18:00", close: "23:00" },
      { day: 1, open: "11:00", close: "15:00" },
      { day: 2, open: "10:00", close: "10:00" },
    ]);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ day: 1, slots: ["11:00–15:00", "18:00–23:00"] });
    expect(days[1].slots).toEqual([]);
  });

  it("maps database codes to known errors", () => {
    expect(actionError("otp_mismatch")).toBe("otp_mismatch");
    expect(actionError("partner_unavailable")).toBe("partner_unavailable");
    expect(actionError("sold_out")).toBe("unknown");
  });
});
