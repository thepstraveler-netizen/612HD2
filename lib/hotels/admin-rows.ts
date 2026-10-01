import type { z } from "zod";
import type { CancellationRule } from "@/lib/availability/engine";
import type { TablesInsert } from "@/types/database";
import type { hotelFormSchema, pricingRuleFormSchema, ratePlanFormSchema } from "@/schemas/hotels";

/**
 * Validated admin form values → table rows. Pure, so the money and
 * percentage conversions are unit-tested; the server actions only write.
 */

type HotelForm = z.output<typeof hotelFormSchema>;
type PlanForm = z.output<typeof ratePlanFormSchema>;
type PricingRuleForm = z.output<typeof pricingRuleFormSchema>;

/** Percent (may have two decimals) → basis points: 12.5 → 1250, -10 → -1000. */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/** Rupees (validated, up to two decimals) → integer paise. */
export function rupeesToPaiseExact(rupees: number): number {
  return Math.round(rupees * 100);
}

export function hotelRow(form: HotelForm): TablesInsert<"hotels"> {
  return {
    slug: form.slug,
    name: form.name,
    summary: form.summary,
    // NOT NULL column: an empty description is stored as {en: ""}.
    description: form.description ?? { en: "" },
    property_type: form.property_type,
    star_rating: form.star_rating,
    city_id: form.city_id,
    area_id: form.area_id,
    vendor_id: form.vendor_id,
    address: form.address || null,
    lat: form.lat,
    lng: form.lng,
    check_in_time: form.check_in_time,
    check_out_time: form.check_out_time,
    highlights: form.highlights,
    food_dining: form.food_dining,
    policies: form.policies,
    is_couple_friendly: form.is_couple_friendly,
    is_featured: form.is_featured,
    is_sponsored: form.is_sponsored,
    pay_at_hotel_enabled: form.pay_at_hotel_enabled,
    part_payment_percent: form.part_payment_percent,
    early_checkin_paise: form.early_checkin,
    late_checkout_paise: form.late_checkout,
    breakfast_addon_paise: form.breakfast_addon,
    commission_bps: form.commission_percent === null ? null : percentToBps(form.commission_percent),
    rating_avg: form.rating_avg === null ? null : Math.round(form.rating_avg * 10) / 10,
    rating_count: form.rating_count,
    status: form.status,
    seo: { title: form.seo_title, description: form.seo_description },
    sort_order: form.sort_order,
  };
}

export function cancellationRules(plan: Pick<PlanForm, "is_refundable" | "free_cancel_hours">) {
  const rules: CancellationRule[] =
    plan.is_refundable && plan.free_cancel_hours !== null
      ? [{ hours_before: plan.free_cancel_hours, refund_percent: 100 }]
      : [];
  return rules;
}

export function ratePlanRow(plan: PlanForm, roomId: string, sortOrder: number) {
  return {
    room_id: roomId,
    name: plan.name,
    meal_plan: plan.meal_plan,
    inclusions: plan.inclusions,
    is_refundable: plan.is_refundable,
    cancellation_rules: cancellationRules(plan),
    base_price_paise: plan.base_price,
    extra_adult_paise: plan.extra_adult,
    extra_child_paise: plan.extra_child,
    min_stay: plan.min_stay,
    max_stay: plan.max_stay,
    sort_order: sortOrder,
    is_active: plan.is_active,
  } satisfies TablesInsert<"hotel_rate_plans">;
}

/** Stored value of a pricing rule: percent → basis points; flat/fixed → paise. */
export function pricingRuleValue(adjustment: PricingRuleForm["adjustment"], amount: number): number {
  return adjustment === "percent" ? percentToBps(amount) : rupeesToPaiseExact(amount);
}

export function pricingRuleRow(form: PricingRuleForm) {
  return {
    hotel_id: form.hotel_id,
    room_id: form.room_id,
    rate_plan_id: form.rate_plan_id,
    name: form.name,
    start_date: form.start_date,
    end_date: form.end_date,
    weekdays: [...new Set(form.weekdays)].sort((a, b) => a - b),
    adjustment: form.adjustment,
    value: pricingRuleValue(form.adjustment, form.amount),
    priority: form.priority,
    is_active: form.is_active,
  } satisfies TablesInsert<"hotel_pricing_rules">;
}

/** Stored rule value (bps or paise, both ×100) → the form's amount text ("25", "-10", "1499.50"). */
export function pricingRuleAmountInput(value: number): string {
  const n = value / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
