import type { Tone } from "@/components/admin/booking-status";
import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import { addDays, todayInIndia, type IsoDate } from "@/lib/dates";
import { percentToBps } from "@/lib/hotels/admin-rows";
import type { LocalizedJson } from "@/lib/i18n/localized";
import { paiseToRupeesInput } from "@/lib/money";
import {
  storeHoursSchema,
  type DeliverySettings,
  type OrderStatus,
  type PrescriptionStatus,
  type QuoteLine,
  type StoreHours,
  type StoreKind,
} from "@/schemas/delivery";
import type {
  AddonForm,
  AddonFormInput,
  AddonGroupForm,
  AddonGroupFormInput,
  CategoryForm,
  CategoryFormInput,
  DeliverySettingsForm,
  DeliverySettingsFormInput,
  DeliveryZoneForm,
  DeliveryZoneFormInput,
  ItemForm,
  ItemFormInput,
  OrderMove,
  PrescriptionTab,
  QuoteForm,
  RiderForm,
  RiderFormInput,
  StoreForm,
  StoreFormInput,
  StoreHoursRowInput,
  VariantForm,
  VariantFormInput,
} from "@/schemas/delivery-admin";
import type { Tables, TablesInsert } from "@/types/database";
import { nextStatuses, primaryNext } from "./status";

/**
 * Pure helpers behind the delivery admin: validated form values ↔ table
 * rows (rupees ↔ paise, % ↔ basis points), weekly hours, the order board
 * as staff see it, settlement math, the quote builder and RPC error codes.
 * Unit-tested; the server code only reads and writes.
 */

const emptyLocalized = { en: "", hi: "" };

function localizedInput(value: LocalizedJson | null | undefined) {
  return value ? { en: value.en, hi: value.hi ?? "" } : emptyLocalized;
}

/** Vendor kinds that may own each store kind. */
export const VENDOR_KINDS_FOR: Record<StoreKind, readonly Tables<"vendors">["kind"][]> = {
  restaurant: ["restaurant", "store", "other"],
  grocery: ["store", "restaurant", "other"],
  pharmacy: ["pharmacy"],
};

// ---------------------------------------------------------------- weekly hours

/** Hours editor rows → stored hours, by day then opening time. */
export function storeHoursValue(rows: readonly { day: number; open: string; close: string }[]): StoreHours {
  return [...rows]
    .map((r) => ({ day: Number(r.day), open: r.open, close: r.close }))
    .sort((a, b) => a.day - b.day || a.open.localeCompare(b.open));
}

/** Stored hours (jsonb) → editor rows; an invalid value opens empty. "24:00" shows as midnight (00:00). */
export function storeHoursRows(value: unknown): StoreHoursRowInput[] {
  const parsed = storeHoursSchema.safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((s) => ({
    day: s.day,
    open: s.open,
    close: s.close === "24:00" ? "00:00" : s.close,
  }));
}

/** Copies one day's slots to every other day (replacing theirs). */
export function copyDayToAll(rows: readonly StoreHoursRowInput[], day: number): StoreHoursRowInput[] {
  const source = rows.filter((r) => Number(r.day) === day);
  return storeHoursValue(
    [1, 2, 3, 4, 5, 6, 7].flatMap((d) => source.map((s) => ({ day: d, open: s.open, close: s.close }))),
  );
}

// ---------------------------------------------------------------- stores

export function storeRow(form: StoreForm): TablesInsert<"stores"> {
  return {
    vendor_id: form.vendor_id,
    kind: form.kind,
    slug: form.slug,
    name: form.name,
    // Nullable column; the generated insert type is stricter.
    description: form.description as LocalizedJson | null,
    cuisines: form.cuisines,
    image_id: form.image_id,
    address: form.address,
    phone: form.phone,
    lat: form.lat,
    lng: form.lng,
    pure_veg: form.pure_veg,
    is_24x7: form.is_24x7,
    hours: storeHoursValue(form.hours),
    accepting_orders: form.accepting_orders,
    prep_minutes: form.prep_minutes,
    min_order_paise: form.min_order,
    packaging_fee_paise: form.packaging_fee,
    tax_bps: percentToBps(form.gst_percent),
    drug_licence_no: form.kind === "pharmacy" ? form.drug_licence_no : form.drug_licence_no || null,
    is_featured: form.is_featured,
    is_active: form.is_active,
    sort_order: form.sort_order,
  };
}

export function newStoreValues(kind: StoreKind): StoreFormInput {
  return {
    vendor_id: "",
    kind,
    slug: "",
    name: emptyLocalized,
    description: emptyLocalized,
    cuisines: "",
    image_id: "",
    address: "",
    phone: "",
    lat: "",
    lng: "",
    pure_veg: false,
    is_24x7: kind === "pharmacy",
    hours: [],
    accepting_orders: true,
    prep_minutes: kind === "restaurant" ? 20 : 10,
    min_order: "0",
    packaging_fee: "0",
    // Restaurants 5%; goods default to 12% (items usually set their own).
    gst_percent: kind === "restaurant" ? "5" : "12",
    drug_licence_no: "",
    zone_ids: [],
    is_featured: false,
    is_active: true,
    sort_order: 100,
  };
}

export function storeFormValues(s: Tables<"stores">, zoneIds: readonly string[]): StoreFormInput {
  return {
    id: s.id,
    vendor_id: s.vendor_id,
    kind: s.kind,
    slug: s.slug,
    name: localizedInput(s.name),
    description: localizedInput(s.description),
    cuisines: s.cuisines.join(", "),
    image_id: s.image_id ?? "",
    address: s.address ?? "",
    phone: s.phone ?? "",
    lat: s.lat === null ? "" : String(s.lat),
    lng: s.lng === null ? "" : String(s.lng),
    pure_veg: s.pure_veg,
    is_24x7: s.is_24x7,
    hours: storeHoursRows(s.hours),
    accepting_orders: s.accepting_orders,
    prep_minutes: s.prep_minutes,
    min_order: paiseToRupeesInput(s.min_order_paise),
    packaging_fee: paiseToRupeesInput(s.packaging_fee_paise),
    gst_percent: bpsToPercentInput(s.tax_bps),
    drug_licence_no: s.drug_licence_no ?? "",
    zone_ids: [...zoneIds],
    is_featured: s.is_featured,
    is_active: s.is_active,
    sort_order: s.sort_order,
  };
}

// ---------------------------------------------------------------- menu

export function categoryRow(form: CategoryForm): TablesInsert<"store_categories"> {
  return { store_id: form.store_id, name: form.name, is_active: form.is_active, sort_order: form.sort_order };
}

export function categoryFormValues(c: Tables<"store_categories">): CategoryFormInput {
  return {
    id: c.id,
    store_id: c.store_id,
    name: localizedInput(c.name),
    is_active: c.is_active,
    sort_order: c.sort_order,
  };
}

export function newCategoryValues(storeId: string, sortOrder = 100): CategoryFormInput {
  return { store_id: storeId, name: emptyLocalized, is_active: true, sort_order: sortOrder };
}

export function itemRow(form: ItemForm): TablesInsert<"store_items"> {
  return {
    store_id: form.store_id,
    category_id: form.category_id,
    name: form.name,
    description: form.description as LocalizedJson | null,
    image_id: form.image_id,
    diet: form.diet,
    is_jain: form.is_jain,
    is_sattvik: form.is_sattvik,
    price_paise: form.price,
    mrp_paise: form.mrp,
    tax_bps: form.gst_percent === null ? null : percentToBps(form.gst_percent),
    hsn: form.hsn || null,
    unit: form.unit,
    track_stock: form.track_stock,
    // Untracked items keep no count, so the shop never shows a stale one.
    stock: form.track_stock ? form.stock : null,
    is_available: form.is_available,
    is_bestseller: form.is_bestseller,
    sort_order: form.sort_order,
  };
}

export function newItemValues(storeId: string, categoryId: string | null, kind: StoreKind): ItemFormInput {
  return {
    store_id: storeId,
    category_id: categoryId ?? "",
    name: emptyLocalized,
    description: emptyLocalized,
    image_id: "",
    diet: kind === "restaurant" ? "veg" : "na",
    is_jain: false,
    is_sattvik: false,
    price: "",
    mrp: "",
    gst_percent: "",
    hsn: "",
    unit: "",
    track_stock: kind !== "restaurant",
    stock: kind !== "restaurant" ? "0" : "",
    is_available: true,
    is_bestseller: false,
    sort_order: 100,
  };
}

export function itemFormValues(i: Tables<"store_items">): ItemFormInput {
  return {
    id: i.id,
    store_id: i.store_id,
    category_id: i.category_id ?? "",
    name: localizedInput(i.name),
    description: localizedInput(i.description),
    image_id: i.image_id ?? "",
    diet: i.diet,
    is_jain: i.is_jain,
    is_sattvik: i.is_sattvik,
    price: paiseToRupeesInput(i.price_paise),
    mrp: paiseToRupeesInput(i.mrp_paise),
    gst_percent: i.tax_bps === null ? "" : bpsToPercentInput(i.tax_bps),
    hsn: i.hsn ?? "",
    unit: i.unit ?? "",
    track_stock: i.track_stock,
    stock: i.stock === null ? "" : String(i.stock),
    is_available: i.is_available,
    is_bestseller: i.is_bestseller,
    sort_order: i.sort_order,
  };
}

export function variantRow(form: VariantForm): TablesInsert<"item_variants"> {
  return {
    item_id: form.item_id,
    name: form.name,
    price_paise: form.price,
    stock: form.stock,
    is_available: form.is_available,
    sort_order: form.sort_order,
  };
}

export function variantFormValues(v: Tables<"item_variants">): VariantFormInput {
  return {
    id: v.id,
    item_id: v.item_id,
    name: localizedInput(v.name),
    price: paiseToRupeesInput(v.price_paise),
    stock: v.stock === null ? "" : String(v.stock),
    is_available: v.is_available,
    sort_order: v.sort_order,
  };
}

export function newVariantValues(itemId: string): VariantFormInput {
  return { item_id: itemId, name: emptyLocalized, price: "", stock: "", is_available: true, sort_order: 100 };
}

export function addonGroupRow(form: AddonGroupForm): TablesInsert<"item_addon_groups"> {
  return {
    item_id: form.item_id,
    name: form.name,
    min_select: form.min_select,
    max_select: form.max_select,
    sort_order: form.sort_order,
  };
}

export function addonGroupFormValues(g: Tables<"item_addon_groups">): AddonGroupFormInput {
  return {
    id: g.id,
    item_id: g.item_id,
    name: localizedInput(g.name),
    min_select: g.min_select,
    max_select: g.max_select,
    sort_order: g.sort_order,
  };
}

export function newAddonGroupValues(itemId: string): AddonGroupFormInput {
  return { item_id: itemId, name: emptyLocalized, min_select: 0, max_select: 1, sort_order: 100 };
}

export function addonRow(form: AddonForm): TablesInsert<"item_addons"> {
  return {
    group_id: form.group_id,
    name: form.name,
    price_paise: form.price,
    is_available: form.is_available,
    sort_order: form.sort_order,
  };
}

export function addonFormValues(a: Tables<"item_addons">): AddonFormInput {
  return {
    id: a.id,
    group_id: a.group_id,
    name: localizedInput(a.name),
    price: paiseToRupeesInput(a.price_paise),
    is_available: a.is_available,
    sort_order: a.sort_order,
  };
}

export function newAddonValues(groupId: string): AddonFormInput {
  return { group_id: groupId, name: emptyLocalized, price: "0", is_available: true, sort_order: 100 };
}

// ---------------------------------------------------------------- zones and riders

export function deliveryZoneRow(form: DeliveryZoneForm): TablesInsert<"delivery_zones"> {
  return {
    slug: form.slug,
    name: form.name,
    fee_paise: form.fee,
    free_above_paise: form.free_above,
    eta_minutes: form.eta_minutes,
    is_active: form.is_active,
    sort_order: form.sort_order,
  };
}

export const NEW_DELIVERY_ZONE: DeliveryZoneFormInput = {
  slug: "",
  name: emptyLocalized,
  fee: "30",
  free_above: "",
  eta_minutes: 40,
  is_active: true,
  sort_order: 100,
};

export function deliveryZoneFormValues(z: Tables<"delivery_zones">): DeliveryZoneFormInput {
  return {
    id: z.id,
    slug: z.slug,
    name: localizedInput(z.name),
    fee: paiseToRupeesInput(z.fee_paise),
    free_above: paiseToRupeesInput(z.free_above_paise),
    eta_minutes: z.eta_minutes,
    is_active: z.is_active,
    sort_order: z.sort_order,
  };
}

export function riderRow(form: RiderForm): TablesInsert<"delivery_partners"> {
  return {
    full_name: form.full_name,
    phone: form.phone,
    vehicle: form.vehicle,
    vendor_id: form.vendor_id,
    is_active: form.is_active,
    notes: form.notes,
  };
}

export const NEW_RIDER: RiderFormInput = {
  full_name: "",
  phone: "",
  vehicle: "",
  vendor_id: "",
  is_active: true,
  notes: "",
};

export function riderFormValues(r: Tables<"delivery_partners">): RiderFormInput {
  return {
    id: r.id,
    full_name: r.full_name,
    phone: r.phone,
    vehicle: r.vehicle ?? "",
    vendor_id: r.vendor_id ?? "",
    is_active: r.is_active,
    notes: r.notes ?? "",
  };
}

// ---------------------------------------------------------------- order board

export const FINISHED_STATUSES: readonly OrderStatus[] = ["delivered", "cancelled", "rejected"];

export function orderTone(status: OrderStatus): Tone {
  switch (status) {
    case "placed":
      return "warning";
    case "accepted":
    case "preparing":
    case "ready":
    case "out_for_delivery":
      return "info";
    case "delivered":
      return "success";
    case "cancelled":
    case "rejected":
      return "danger";
    default:
      return "muted";
  }
}

/** The main button on a board card, and the other moves staff may make (skips, reject). */
export function orderMoves(status: OrderStatus): { primary: OrderMove | null; others: OrderMove[] } {
  const primary = primaryNext(status) as OrderMove | null;
  const others = nextStatuses(status).filter(
    (s): s is OrderMove => s !== primary && s !== "rejected" && s !== "awaiting_payment",
  );
  return { primary, others };
}

export function canReject(status: OrderStatus): boolean {
  return nextStatuses(status).includes("rejected");
}

/** assign_delivery_partner() accepts these. */
export function canAssignRider(status: OrderStatus): boolean {
  return (
    status === "placed" ||
    status === "accepted" ||
    status === "preparing" ||
    status === "ready" ||
    status === "out_for_delivery"
  );
}

/** Riders who may take an order: platform riders and the order's vendor's own. */
export function ridersFor<R extends { vendorId: string | null }>(
  riders: readonly R[],
  vendorId: string,
): R[] {
  return riders.filter((r) => r.vendorId === null || r.vendorId === vendorId);
}

export type OrderPayment = { kind: "cod"; duePaise: number } | { kind: "online"; paid: boolean };

/** Cash on delivery (bookings.payment_mode pay_at_hotel) with what the rider collects, or online. */
export function orderPayment(b: {
  payment_mode: string;
  total_paise: number;
  paid_paise: number;
}): OrderPayment {
  const duePaise = Math.max(0, b.total_paise - b.paid_paise);
  return b.payment_mode === "pay_at_hotel"
    ? { kind: "cod", duePaise }
    : { kind: "online", paid: duePaise === 0 };
}

/** "2 × Paneer Tikka (Half), 1 × Roti" — the first few lines, then "+N more". */
export function itemsSummary(
  items: readonly { name: string; variant_name: string | null; quantity: number }[],
  max = 4,
): { text: string; more: number } {
  const shown = items
    .slice(0, max)
    .map((i) => `${i.quantity} × ${i.name}${i.variant_name ? ` (${i.variant_name})` : ""}`);
  return { text: shown.join(", "), more: Math.max(0, items.length - max) };
}

/** Whole minutes since the order was placed (or created). */
export function orderAgeMinutes(o: { placed_at: string | null; created_at: string }, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(o.placed_at ?? o.created_at)) / 60_000));
}

/** Orders waiting this long in their column are flagged on the board. */
export function isOrderLate(
  status: OrderStatus,
  ageMinutes: number,
  etaAt: string | null,
  now: number,
): boolean {
  if (status === "placed") return ageMinutes >= 5;
  return etaAt !== null && Date.parse(etaAt) < now && status !== "delivered";
}

/** The delivery address snapshot (jsonb) as one line. */
export function addressLine(address: unknown): string {
  if (!address || typeof address !== "object") return "";
  const a = address as Record<string, unknown>;
  return ["line1", "line2", "landmark", "pincode"]
    .map((k) => (typeof a[k] === "string" ? (a[k] as string).trim() : ""))
    .filter(Boolean)
    .join(", ");
}

/** Database errors raised by set_order_status / assign_delivery_partner → keys under deliveryAdmin.errors. */
export function deliveryErrorKey(code: string): string {
  const codes = {
    invalid_transition: "invalidTransition",
    otp_mismatch: "otpMismatch",
    partner_unavailable: "riderUnavailable",
    not_found: "notFound",
  } as const;
  for (const [db, key] of Object.entries(codes)) {
    if (code.includes(db)) return key;
  }
  return "actionFailed";
}

// ---------------------------------------------------------------- settlements

export type SettlementOrder = {
  vendor_id: string;
  total_paise: number;
  payment_mode: string;
};

export type SettlementRow = {
  vendorId: string;
  vendorName: string;
  commissionBps: number;
  orders: number;
  grossPaise: number;
  commissionPaise: number;
  netPaise: number;
  codPaise: number;
  onlinePaise: number;
};

/**
 * Per-vendor summary of delivered orders. Commission is the vendor's
 * commission_bps applied to the GROSS order total (bookings.total_paise:
 * items, packaging, delivery and GST), the simplest figure both sides can
 * check against the invoice; net payable = gross − commission. COD is what
 * riders collected in cash, online what was paid through the gateway.
 */
export function settlementSummary(
  orders: readonly SettlementOrder[],
  vendors: ReadonlyMap<string, { name: string; commission_bps: number }>,
): { rows: SettlementRow[]; totals: Omit<SettlementRow, "vendorId" | "vendorName" | "commissionBps"> } {
  const byVendor = new Map<string, SettlementRow>();
  for (const o of orders) {
    const v = vendors.get(o.vendor_id);
    let row = byVendor.get(o.vendor_id);
    if (!row) {
      row = {
        vendorId: o.vendor_id,
        vendorName: v?.name ?? "–",
        commissionBps: v?.commission_bps ?? 0,
        orders: 0,
        grossPaise: 0,
        commissionPaise: 0,
        netPaise: 0,
        codPaise: 0,
        onlinePaise: 0,
      };
      byVendor.set(o.vendor_id, row);
    }
    row.orders += 1;
    row.grossPaise += o.total_paise;
    if (o.payment_mode === "pay_at_hotel") row.codPaise += o.total_paise;
    else row.onlinePaise += o.total_paise;
  }
  const rows = [...byVendor.values()]
    .map((r) => {
      // Rounded once per vendor so the rows add up to the statement total.
      const commissionPaise = Math.round((r.grossPaise * r.commissionBps) / 10_000);
      return { ...r, commissionPaise, netPaise: r.grossPaise - commissionPaise };
    })
    .sort((a, b) => b.grossPaise - a.grossPaise || a.vendorName.localeCompare(b.vendorName));
  const totals = rows.reduce(
    (t, r) => ({
      orders: t.orders + r.orders,
      grossPaise: t.grossPaise + r.grossPaise,
      commissionPaise: t.commissionPaise + r.commissionPaise,
      netPaise: t.netPaise + r.netPaise,
      codPaise: t.codPaise + r.codPaise,
      onlinePaise: t.onlinePaise + r.onlinePaise,
    }),
    { orders: 0, grossPaise: 0, commissionPaise: 0, netPaise: 0, codPaise: 0, onlinePaise: 0 },
  );
  return { rows, totals };
}

/** Settlement range: given dates (swapped if reversed, at most a year), else this month so far (India). */
export function settlementRange(
  filters: { from?: IsoDate; to?: IsoDate },
  now: Date = new Date(),
): { from: IsoDate; to: IsoDate } {
  const today = todayInIndia(now);
  let from = filters.from ?? `${today.slice(0, 8)}01`;
  let to = filters.to ?? today;
  if (from > to) [from, to] = [to, from];
  if (addDays(from, 366) < to) from = addDays(to, -366);
  return { from, to };
}

// ---------------------------------------------------------------- prescriptions and quotes

/** Statuses a queue tab lists; null = every status. */
export function prescriptionTabStatuses(tab: PrescriptionTab): PrescriptionStatus[] | null {
  switch (tab) {
    case "open":
      return ["submitted", "reviewing"];
    case "all":
      return null;
    default:
      return [tab];
  }
}

export function prescriptionTone(status: PrescriptionStatus): Tone {
  switch (status) {
    case "submitted":
      return "warning";
    case "reviewing":
    case "quoted":
      return "info";
    case "ordered":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "muted";
  }
}

/** A prescription can be quoted (again) until it is ordered. */
export function canQuote(status: PrescriptionStatus): boolean {
  return status === "submitted" || status === "reviewing" || status === "quoted" || status === "expired";
}

/** Quote builder rows → stored quote lines (paise, basis points). */
export function quoteFormLines(form: Pick<QuoteForm, "lines">): QuoteLine[] {
  return form.lines.map((l) => ({
    name: l.name,
    pack: l.pack,
    qty: l.qty,
    unit_price_paise: l.unit_price,
    tax_bps: percentToBps(l.gst_percent),
    hsn: l.hsn,
  }));
}

export const NEW_QUOTE_LINE = { name: "", pack: "", qty: 1, unit_price: "", gst_percent: "12", hsn: "" };

/** Valid until: now + the configured hours. */
export function quoteValidUntil(hours: number, now: number = Date.now()): string {
  return new Date(now + hours * 3_600_000).toISOString();
}

/** The customer's prescription page (Hindi under /hi). */
export function prescriptionUrl(siteUrl: string, locale: "en" | "hi", prescriptionId: string): string {
  return `${siteUrl.replace(/\/$/, "")}${locale === "hi" ? "/hi" : ""}/account/prescriptions/${prescriptionId}`;
}

// ---------------------------------------------------------------- settings

/** Settings form → stored `delivery.defaults` value. */
export function deliverySettingsValue(form: DeliverySettingsForm): DeliverySettings {
  return {
    require_delivery_otp: form.require_delivery_otp,
    cod_enabled: form.cod_enabled,
    max_cod_paise: form.max_cod,
    hold_minutes: form.hold_minutes,
    delivery_tax_bps: percentToBps(form.delivery_gst_percent),
    delivery_sac: form.delivery_sac,
    food_sac: form.food_sac,
    goods_sac: form.goods_sac,
    quote_valid_hours: form.quote_valid_hours,
    max_items: form.max_items,
    cancel_until: form.cancel_until,
    medicine_notice: form.medicine_notice,
  };
}

export function deliverySettingsFormValues(s: DeliverySettings): DeliverySettingsFormInput {
  return {
    require_delivery_otp: s.require_delivery_otp,
    cod_enabled: s.cod_enabled,
    max_cod: paiseToRupeesInput(s.max_cod_paise),
    hold_minutes: s.hold_minutes,
    delivery_gst_percent: bpsToPercentInput(s.delivery_tax_bps),
    delivery_sac: s.delivery_sac,
    food_sac: s.food_sac,
    goods_sac: s.goods_sac,
    quote_valid_hours: s.quote_valid_hours,
    max_items: s.max_items,
    cancel_until: s.cancel_until,
    medicine_notice: { en: s.medicine_notice.en, hi: s.medicine_notice.hi ?? "" },
  };
}
