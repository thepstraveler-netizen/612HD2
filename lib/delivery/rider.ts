import "server-only";
import { mapsUrl } from "@/lib/geo";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverySettingsSchema, type OrderStatus } from "@/schemas/delivery";
import type { LocalizedJson, Tables } from "@/types/database";
import { orderAddress, orderCash } from "./vendor-ui";

/**
 * The rider's order page works from the secret link alone (no login), like
 * the driver's ride link: the token is looked up with the service role and
 * only this order's pickup and drop details are returned. The link stops
 * working a day after assignment or once the order goes to another rider.
 */

const TOKEN = /^[0-9a-f]{48}$/;

export async function orderByToken(token: string): Promise<Tables<"orders"> | null> {
  if (!TOKEN.test(token)) return null;
  const { data: order } = await createAdminClient()
    .from("orders")
    .select("*")
    .eq("partner_token", token)
    .maybeSingle();
  if (!order || !order.partner_token_expires_at || Date.parse(order.partner_token_expires_at) < Date.now()) {
    return null;
  }
  return order;
}

export type RiderOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  riderName: string | null;
  store: { name: LocalizedJson; address: string | null; phone: string | null; map: string | null };
  customer: { name: string; phone: string; address: string; landmark: string | null; map: string | null };
  itemCount: number;
  /** Cash to collect at the door (0 when paid online). */
  collectPaise: number;
  cod: boolean;
  requireOtp: boolean;
  pickedUpAt: string | null;
  deliveredAt: string | null;
};

const searchMap = (text: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;

export async function getRiderOrder(token: string): Promise<RiderOrder | null> {
  const order = await orderByToken(token);
  if (!order) return null;
  const admin = createAdminClient();
  const [{ data: booking }, { data: store }, { data: items }, { data: settings }] = await Promise.all([
    admin
      .from("bookings")
      .select("code, contact_name, contact_phone, total_paise, paid_paise, refunded_paise, payment_mode")
      .eq("id", order.booking_id)
      .maybeSingle(),
    admin.from("stores").select("name, address, phone, lat, lng").eq("id", order.store_id).maybeSingle(),
    admin.from("order_items").select("quantity").eq("order_id", order.id),
    admin.from("settings").select("value").eq("key", "delivery.defaults").maybeSingle(),
  ]);
  if (!booking || !store) return null;
  const address = orderAddress(order.address);
  const parsedSettings = deliverySettingsSchema.safeParse(settings?.value ?? {});
  const cash = orderCash({
    totalPaise: booking.total_paise,
    paidPaise: booking.paid_paise,
    refundedPaise: booking.refunded_paise,
  });
  return {
    id: order.id,
    code: booking.code,
    status: order.status,
    riderName: order.partner_name,
    store: {
      name: store.name,
      address: store.address,
      phone: store.phone,
      map:
        store.lat !== null && store.lng !== null
          ? mapsUrl(store.lat, store.lng)
          : store.address
            ? searchMap(store.address)
            : null,
    },
    customer: {
      name: address.name || booking.contact_name,
      phone: address.phone || booking.contact_phone,
      address: address.text,
      landmark: address.landmark,
      map:
        address.lat !== null && address.lng !== null
          ? mapsUrl(address.lat, address.lng)
          : address.text
            ? searchMap([address.text, address.landmark].filter(Boolean).join(", "))
            : null,
    },
    itemCount: (items ?? []).reduce((s, i) => s + i.quantity, 0),
    collectPaise: cash.collectPaise,
    cod: booking.payment_mode === "pay_at_hotel",
    requireOtp: parsedSettings.success ? parsedSettings.data.require_delivery_otp : true,
    pickedUpAt: order.picked_up_at,
    deliveredAt: order.delivered_at,
  };
}
