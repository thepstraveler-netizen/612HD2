import { bpsToPercentInput } from "@/lib/bookings/admin-forms";
import { percentToBps } from "@/lib/hotels/admin-rows";
import type { LoyaltySettings } from "@/lib/loyalty/rules";
import { paiseToRupeesInput } from "@/lib/money";
import { BOOKING_SERVICES } from "@/schemas/booking-admin";
import type {
  LoyaltySettingsForm,
  LoyaltySettingsFormInput,
  ReviewsSettingsForm,
  ReviewsSettingsFormInput,
} from "@/schemas/engagement-admin";
import type { ReviewsSettings } from "@/schemas/reviews";

/**
 * Settings → Reviews & rewards: stored `reviews.defaults` /
 * `loyalty.defaults` values ⇄ form values (rupees and % in the form, paise
 * and basis points stored).
 */

export function reviewsSettingsFormValues(s: ReviewsSettings): ReviewsSettingsFormInput {
  return {
    auto_publish: s.auto_publish,
    window_days: s.window_days,
    max_photos: s.max_photos,
    max_photo_mb: String(s.max_photo_mb),
    min_body_chars: s.min_body_chars,
  };
}

export function reviewsSettingsValue(form: ReviewsSettingsForm): ReviewsSettings {
  return { ...form };
}

const SERVICES = new Set<string>(BOOKING_SERVICES);

export function loyaltySettingsFormValues(s: LoyaltySettings): LoyaltySettingsFormInput {
  return {
    enabled: s.enabled,
    point_value_rupees: paiseToRupeesInput(s.point_value_paise),
    earn_percent: bpsToPercentInput(s.earn_bps),
    earn_services: s.earn_services.filter((v): v is (typeof BOOKING_SERVICES)[number] => SERVICES.has(v)),
    min_redeem_points: s.min_redeem_points,
    max_redeem_points: s.max_redeem_points === null ? "" : String(s.max_redeem_points),
    code_valid_days: s.code_valid_days,
    expiry_days: s.expiry_days,
    review_points: s.review_points,
    referrals_enabled: s.referrals_enabled,
    referrer_points: s.referrer_points,
    referee_points: s.referee_points,
  };
}

export function loyaltySettingsValue(form: LoyaltySettingsForm): LoyaltySettings {
  return {
    enabled: form.enabled,
    point_value_paise: form.point_value_rupees,
    earn_bps: percentToBps(form.earn_percent),
    earn_services: form.earn_services,
    min_redeem_points: form.min_redeem_points,
    max_redeem_points: form.max_redeem_points,
    code_valid_days: form.code_valid_days,
    expiry_days: form.expiry_days,
    review_points: form.review_points,
    referrals_enabled: form.referrals_enabled,
    referrer_points: form.referrer_points,
    referee_points: form.referee_points,
  };
}
