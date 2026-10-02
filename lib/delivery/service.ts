import "server-only";
import { randomInt } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import {
  BookingError,
  cancelWithRefund,
  dbError,
  notifyBooking,
  openPaymentOrder,
  type CreatedBooking,
} from "@/lib/bookings/service";
import { generateBookingCode } from "@/lib/bookings/state";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { publicEnv } from "@/lib/env";
import type { BookingPrice } from "@/lib/pricing/booking";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DeliveryAddress, OrderPaymentMode, OrderStatus, StoreKind } from "@/schemas/delivery";
import type { Json, Tables } from "@/types/database";
import type { OrderCheckoutQuote } from "./checkout";
import type { ResolvedLine } from "./cart";

/**
 * Order writes, run with the service role after the caller has been
 * authorised. create_order writes the booking, lines, coupon hold, order,
 * items and stock in one transaction; cash-on-delivery orders come back
 * confirmed and go straight to the store.
 */

const createdOrderSchema = z.object({ id: z.uuid(), code: z.string(), order_id: z.uuid(), status: z.string() });

export type Contact = { name: string; phone: string; email: string | null; notes: string | null };

type OrderWrite = {
  storeId: string;
  storeKind: StoreKind;
  storeName: Tables<"stores">["name"];
  zoneId: string;
  address: DeliveryAddress;
  price: BookingPrice;
  pay: OrderPaymentMode;
  payableNowPaise: number;
  coupon: { id: string; code: string } | null;
  holdMinutes: number;
  orderItems: Json[];
  snapshot: { [key: string]: Json };
  prescriptionId?: string;
  quoteId?: string;
};

function addressJson(a: DeliveryAddress) {
  return {
    contact_name: a.contactName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 || null,
    landmark: a.landmark || null,
    pincode: a.pincode || null,
  };
}

async function writeOrder(w: OrderWrite, contact: Contact, userId: string, locale: "en" | "hi"): Promise<CreatedBooking> {
  const admin = createAdminClient();
  const booking = {
    user_id: userId,
    contact_name: contact.name,
    contact_email: contact.email,
    contact_phone: contact.phone,
    special_requests: contact.notes ?? "",
    subtotal_paise: w.price.subtotalPaise,
    discount_paise: w.price.discountPaise,
    tax_paise: w.price.taxPaise,
    total_paise: w.price.totalPaise,
    payable_now_paise: w.payableNowPaise,
    payment_mode: w.pay === "online" ? "full" : "pay_at_hotel",
    coupon_id: w.coupon?.id ?? null,
    coupon_code: w.coupon?.code ?? null,
    locale,
    expires_at: new Date(Date.now() + w.holdMinutes * 60_000).toISOString(),
    price_breakdown: { lines: w.price.lines },
    snapshot: w.snapshot,
  };
  const items = w.price.lines.map((l) => ({
    kind: l.kind,
    line_key: l.key,
    description: l.description,
    service_date: l.date,
    quantity: l.quantity,
    amount_paise: l.amountPaise,
    discount_paise: l.discountPaise,
    tax_rate_bps: l.taxRateBps,
    tax_paise: l.taxPaise,
    sac: l.sac,
  }));
  const order = {
    store_id: w.storeId,
    zone_id: w.zoneId,
    address: addressJson(w.address),
    prescription_id: w.prescriptionId ?? null,
    quote_id: w.quoteId ?? null,
  };

  let created: z.infer<typeof createdOrderSchema> | undefined;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const code = generateBookingCode(randomInt);
    const { data, error } = await admin.rpc("create_order", {
      p_booking: { ...booking, code },
      p_items: items,
      p_order: order,
      p_order_items: w.orderItems,
    });
    if (error) {
      if (error.code === "23505" && error.message.includes("bookings_code_key")) continue;
      throw dbError(error);
    }
    created = createdOrderSchema.parse(data);
  }
  if (!created) throw new BookingError("unknown");
  // Stock changed: refresh cached menus.
  revalidateTag(CATALOG_TAG);
  if (created.status === "confirmed") {
    await notifyBooking(created.id, "booking.confirmed");
    return { code: created.code, status: "confirmed" };
  }
  return openPaymentOrder(created, w.payableNowPaise, userId, { order: w.storeKind });
}

const orderItem = (l: ResolvedLine) => ({
  item_id: l.itemId,
  variant_id: l.variantId,
  name: l.name,
  variant_name: l.variantName,
  addons: l.addons.map((a) => ({ name: a.name, price_paise: a.price_paise })),
  diet: l.diet,
  quantity: l.qty,
  unit_price_paise: l.unitPricePaise,
  line_total_paise: l.lineTotalPaise,
});

export async function createDeliveryOrder(
  checkout: OrderCheckoutQuote,
  address: DeliveryAddress,
  contact: Contact,
  userId: string,
  locale: "en" | "hi",
): Promise<CreatedBooking> {
  const { store, zone } = checkout;
  if (!zone) throw new BookingError("not_found");
  return writeOrder(
    {
      storeId: store.id,
      storeKind: store.kind,
      storeName: store.name,
      zoneId: zone.id,
      address,
      price: checkout.price,
      pay: checkout.pay,
      payableNowPaise: checkout.payableNowPaise,
      coupon: checkout.coupon,
      holdMinutes: checkout.settings.hold_minutes,
      orderItems: checkout.lines.map(orderItem),
      snapshot: {
        order: {
          store: { id: store.id, slug: store.slug, name: store.name, kind: store.kind, phone: store.phone },
          zone: { id: zone.id, name: zone.name },
          etaMinutes: checkout.etaMinutes,
          itemCount: checkout.lines.reduce((s, l) => s + l.qty, 0),
        },
        // Generic booking views read `trip.label` for non-hotel services.
        trip: { label: store.name.en, route: zone.name.en, vehicle: "" },
      },
    },
    contact,
    userId,
    locale,
  );
}

export type MedicineOrderInput = {
  quote: Tables<"medicine_quotes">;
  prescription: Tables<"prescriptions">;
  store: Pick<Tables<"stores">, "id" | "kind" | "name" | "slug" | "phone">;
  price: BookingPrice;
  pay: OrderPaymentMode;
  holdMinutes: number;
};

export async function createMedicineOrder(
  input: MedicineOrderInput,
  contact: Contact,
  userId: string,
  locale: "en" | "hi",
): Promise<CreatedBooking> {
  const { quote, prescription, store, price } = input;
  const address = prescription.address as Partial<Record<string, string | null>>;
  const lines = z
    .array(z.object({ name: z.string(), pack: z.string().optional(), qty: z.number(), unit_price_paise: z.number() }))
    .parse(quote.lines);
  return writeOrder(
    {
      storeId: store.id,
      storeKind: "pharmacy",
      storeName: store.name,
      zoneId: prescription.zone_id,
      address: {
        contactName: address.contact_name ?? prescription.patient_name,
        phone: address.phone ?? prescription.phone,
        line1: address.line1 ?? "",
        line2: address.line2 ?? undefined,
        landmark: address.landmark ?? undefined,
        pincode: address.pincode ?? undefined,
        zoneId: prescription.zone_id,
      },
      price,
      pay: input.pay,
      payableNowPaise: input.pay === "online" ? price.totalPaise : 0,
      coupon: null,
      holdMinutes: input.holdMinutes,
      prescriptionId: prescription.id,
      quoteId: quote.id,
      orderItems: lines.map((l) => ({
        name: l.pack ? `${l.name} (${l.pack})` : l.name,
        addons: [],
        quantity: l.qty,
        unit_price_paise: l.unit_price_paise,
        line_total_paise: l.qty * l.unit_price_paise,
      })),
      snapshot: {
        order: {
          store: { id: store.id, slug: store.slug, name: store.name, kind: "pharmacy", phone: store.phone },
          prescriptionId: prescription.id,
          quoteId: quote.id,
          itemCount: lines.reduce((s, l) => s + l.qty, 0),
        },
        trip: { label: store.name.en, route: "", vehicle: "" },
      },
    },
    contact,
    userId,
    locale,
  );
}

/** Statuses the customer hears about (besides the confirmation). */
const NOTIFY_ON: readonly OrderStatus[] = ["accepted", "out_for_delivery", "delivered"];

export type MoveSource = "admin" | "vendor" | "partner";

/**
 * Moves an order one step. A rejection also cancels the booking and refunds
 * everything paid. The customer is told about the steps that matter.
 */
export async function moveOrder(input: {
  orderId: string;
  status: OrderStatus;
  actor: string | null;
  source: MoveSource;
  note?: string | null;
  otp?: string | null;
}): Promise<Tables<"orders">> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("set_order_status", {
    p_order_id: input.orderId,
    p_status: input.status,
    p_actor: input.actor,
    p_source: input.source,
    p_note: input.note ?? null,
    p_otp: input.otp ?? null,
  });
  if (error) throw dbError(error);
  const order = data as Tables<"orders">;
  if (input.status === "rejected") {
    const { data: booking } = await admin
      .from("bookings")
      .select("id, paid_paise, refunded_paise")
      .eq("id", order.booking_id)
      .maybeSingle();
    if (booking) {
      await cancelWithRefund({
        bookingId: booking.id,
        actor: input.actor ?? "",
        reason: input.note ? `Declined by store: ${input.note}` : "Declined by store",
        refundPaise: Math.max(0, booking.paid_paise - booking.refunded_paise),
      });
    }
  } else if (NOTIFY_ON.includes(input.status)) {
    await notifyBooking(order.booking_id, "order.status").catch((e: unknown) =>
      console.error("[delivery] notify", e),
    );
  }
  return order;
}

export async function assignRider(orderId: string, partnerId: string, actor: string | null): Promise<Tables<"orders">> {
  const { data, error } = await createAdminClient().rpc("assign_delivery_partner", {
    p_order_id: orderId,
    p_partner_id: partnerId,
    p_actor: actor,
  });
  if (error) throw dbError(error);
  return data as Tables<"orders">;
}

/** The rider's no-login link. */
export function riderOrderUrl(site: string, token: string): string {
  return `${site.replace(/\/$/, "")}/delivery/order/${token}`;
}

export function riderLink(token: string): string {
  return riderOrderUrl(publicEnv().NEXT_PUBLIC_SITE_URL, token);
}
