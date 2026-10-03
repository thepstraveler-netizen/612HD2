import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrderCheckout, type SavedAddress } from "@/components/delivery/order-checkout";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { ORDER_CHECKOUT_PATH } from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.checkout" });
  return { title: t("title"), robots: { index: false } };
}

/** Public coupons for food and essentials, suggested under the coupon box (filtered by shop in the browser). */
async function suggestedCoupons(locale: string) {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("coupons")
    .select("code, description, services")
    .eq("is_public", true)
    .is("user_id", null)
    .order("code")
    .limit(20);
  return (data ?? [])
    .filter(
      (c) => c.services.length === 0 || c.services.includes("food") || c.services.includes("essentials"),
    )
    .map((c) => ({
      code: c.code,
      description: c.description ? pickLocalized(c.description, locale) : "",
      services: c.services.filter((s): s is "food" | "essentials" => s === "food" || s === "essentials"),
    }));
}

/**
 * Cart and checkout for food and essentials (one page for both shops; the
 * cart in the browser names the store). The server prices the cart on
 * every change and again when the order is placed.
 */
export default async function OrderCheckoutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser(ORDER_CHECKOUT_PATH);
  const t = await getTranslations("shop.checkout");
  const supabase = await createClient();
  // The address book is the user's own (RLS: owner only).
  const [{ data: rows }, coupons] = await Promise.all([
    supabase
      .from("addresses")
      .select("id, label, contact_name, phone, line1, line2, landmark, pincode, zone_id, is_default")
      .eq("user_id", session.user.id)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(20),
    suggestedCoupons(locale),
  ]);
  const addresses: SavedAddress[] = (rows ?? []).map((a) => ({
    id: a.id,
    label: a.label,
    contactName: a.contact_name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? "",
    landmark: a.landmark ?? "",
    pincode: a.pincode ?? "",
    zoneId: a.zone_id,
    isDefault: a.is_default,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-32 sm:py-8 lg:pb-8">
      <Link
        href="/food"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("keepShopping")}
      </Link>
      <h1 className="text-[length:var(--text-title)] leading-tight font-extrabold">{t("title")}</h1>
      <OrderCheckout
        locale={locale === "hi" ? "hi" : "en"}
        addresses={addresses}
        coupons={coupons}
        defaults={{
          name: session.profile?.full_name ?? "",
          phone: session.profile?.phone ?? "",
          email: session.user.email ?? "",
        }}
      />
    </div>
  );
}
