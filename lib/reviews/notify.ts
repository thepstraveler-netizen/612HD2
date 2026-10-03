import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";
import { notify } from "@/lib/notifications/service";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/database";

const loyaltySchema = z.object({ enabled: z.boolean().catch(false).default(false) });

/** What the review is about, in the review's language ("Hotel Radhe Kunj", "Cab booking"). */
async function subjectName(review: Tables<"reviews">): Promise<string> {
  const admin = createAdminClient();
  let name: LocalizedJson | null = null;
  if (review.hotel_id) {
    name =
      (await admin.from("hotels").select("name").eq("id", review.hotel_id).maybeSingle()).data?.name ?? null;
  } else if (review.package_id) {
    name =
      (await admin.from("packages").select("title").eq("id", review.package_id).maybeSingle()).data?.title ??
      null;
  } else if (review.store_id) {
    name =
      (await admin.from("stores").select("name").eq("id", review.store_id).maybeSingle()).data?.name ?? null;
  }
  if (name) return pickLocalized(name, review.locale);
  const t = await getTranslations({ locale: review.locale, namespace: "reviews" });
  return t(`serviceNames.${review.service}`);
}

/**
 * Emails the author that their review is live (template `review.published`),
 * naming the P&S Rewards points it earned when the programme is on. Called
 * once per publish by staff, or on submit when reviews publish automatically.
 */
export async function notifyReviewPublished(review: Tables<"reviews">): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: profile }, { data: booking }, { data: loyalty }, { data: ledger }] = await Promise.all([
      admin.from("profiles").select("full_name, email, phone").eq("id", review.user_id).maybeSingle(),
      admin
        .from("bookings")
        .select("id, contact_name, contact_email")
        .eq("id", review.booking_id)
        .maybeSingle(),
      admin.from("settings").select("value").eq("key", "loyalty.defaults").maybeSingle(),
      admin
        .from("loyalty_ledger")
        .select("points")
        .eq("review_id", review.id)
        .eq("kind", "review")
        .maybeSingle(),
    ]);
    const email = profile?.email || booking?.contact_email || null;
    if (!email) return;
    const enabled = loyaltySchema.safeParse(loyalty?.value ?? {}).data?.enabled ?? false;
    const points = enabled && ledger ? ledger.points : 0;
    const t = await getTranslations({ locale: review.locale, namespace: "reviews" });
    await notify({
      key: "review.published",
      locale: review.locale,
      to: { email, phone: null, userId: review.user_id },
      bookingId: booking?.id ?? null,
      values: {
        name: profile?.full_name?.trim() || booking?.contact_name || review.author_name,
        subject: await subjectName(review),
        points_line: points > 0 ? t("email.pointsLine", { points }) : "",
      },
    });
  } catch (error) {
    console.error("[reviews] publish notification failed", error);
  }
}
