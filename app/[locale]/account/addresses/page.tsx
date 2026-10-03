import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AddressBook, type BookAddress } from "@/components/account/address-book";
import { requireUser } from "@/lib/auth/guards";
import { getDeliveryZones } from "@/lib/delivery/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.addresses");
  return { title: t("title"), robots: { index: false } };
}

export default async function AddressesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireUser("/account/addresses");
  const t = await getTranslations("account.addresses");
  const supabase = await createClient();
  const [{ data: rows }, zones] = await Promise.all([
    supabase
      .from("addresses")
      .select("id, label, contact_name, phone, line1, line2, landmark, pincode, zone_id, is_default")
      .eq("user_id", session.user.id)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50),
    getDeliveryZones(),
  ]);
  const addresses: BookAddress[] = (rows ?? []).map((a) => ({
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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      <AddressBook
        addresses={addresses}
        zones={zones.map((z) => ({ id: z.id, name: pickLocalized(z.name, locale) }))}
      />
    </div>
  );
}
