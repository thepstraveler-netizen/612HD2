import { z } from "zod";

/**
 * Inputs of the vendor dashboard and the rider's no-login link. Every
 * server action re-parses its input with these; ids are checked against
 * the signed-in vendor's own stores before anything is written.
 */

const id = z.uuid();
const otp = z.string().regex(/^[0-9]{4}$/);

/** Steps a store takes from its dashboard (set_order_status also checks the transition). */
export const VENDOR_MOVES = [
  "accepted",
  "rejected",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
] as const;
export type VendorMove = (typeof VENDOR_MOVES)[number];

export const vendorMoveSchema = z
  .object({
    orderId: id,
    status: z.enum(VENDOR_MOVES),
    note: z.string().trim().max(500).optional(),
    otp: otp.optional(),
  })
  .refine((v) => v.status !== "rejected" || (v.note?.length ?? 0) >= 3, { path: ["note"], error: "reason" });
export type VendorMoveInput = z.input<typeof vendorMoveSchema>;

export const vendorAssignSchema = z.object({ orderId: id, partnerId: id });

export const vendorOrderRefSchema = z.object({ orderId: id });

export const storeAcceptingSchema = z.object({ storeId: id, accepting: z.boolean() });

const stock = z.number().int().min(0).max(100_000).nullable();
const price = z.number().int().min(1).max(10_000_000);

/** One change on the menu page: availability, stock (null = not tracked) or price. */
export const menuChangeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("item"),
    id,
    isAvailable: z.boolean().optional(),
    stock: stock.optional(),
    pricePaise: price.optional(),
  }),
  z.object({
    kind: z.literal("variant"),
    id,
    isAvailable: z.boolean().optional(),
    stock: stock.optional(),
    pricePaise: price.optional(),
  }),
  z.object({
    kind: z.literal("addon"),
    id,
    isAvailable: z.boolean().optional(),
    pricePaise: z.number().int().min(0).max(10_000_000).optional(),
  }),
]);
export type MenuChange = z.input<typeof menuChangeSchema>;

/** Steps a rider takes from the link. */
export const RIDER_MOVES = ["out_for_delivery", "delivered"] as const;
export type RiderMove = (typeof RIDER_MOVES)[number];

export const riderStepSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{48}$/),
  status: z.enum(RIDER_MOVES),
  otp: otp.optional(),
});
