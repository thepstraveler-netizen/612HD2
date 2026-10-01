import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PricingRuleForm } from "@/components/admin/hotel-pricing-rule-form";
import { HotelDeleteButton } from "@/components/admin/hotel-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { todayInIndia } from "@/lib/dates";
import { deletePricingRule } from "@/lib/hotels/actions";
import {
  getAdminHotel,
  getHotelRooms,
  getPricingRuleFormValues,
  newPricingRuleDefaults,
} from "@/lib/hotels/admin";
import { pickLocalized } from "@/lib/i18n/localized";

export default async function EditPricingRulePage({
  params,
}: {
  params: Promise<{ id: string; ruleId: string }>;
}) {
  const { id: rawHotel, ruleId: rawRule } = await params;
  const { id: hotelId } = parseEditId(rawHotel);
  if (!hotelId) notFound();
  const { isNew, id: ruleId } = parseEditId(rawRule);
  const list = `/admin/hotels/${hotelId}/pricing`;
  await requirePermission("hotels.write", `${list}/${rawRule}`);
  const t = await getTranslations("hotelsAdmin");
  const locale = await getLocale();

  const [hotel, rooms, values] = await Promise.all([
    getAdminHotel(hotelId),
    getHotelRooms(hotelId),
    ruleId ? getPricingRuleFormValues(hotelId, ruleId) : null,
  ]);
  if (!hotel || (ruleId && !values)) notFound();
  const defaults = values ?? newPricingRuleDefaults(hotelId, todayInIndia());

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={isNew ? t("pricing.newTitle") : defaults.name}
        lead={pickLocalized(hotel.name, locale)}
        backHref={list}
        backLabel={t("nav.pricing")}
      />
      <PricingRuleForm
        defaultValues={defaults}
        rooms={rooms.map((r) => ({ value: r.id, label: pickLocalized(r.name, locale) }))}
        plans={rooms.flatMap((r) =>
          r.plans.map((p) => ({
            value: p.id,
            roomId: r.id,
            label: `${pickLocalized(r.name, locale)} · ${pickLocalized(p.name, locale)}`,
          })),
        )}
        listHref={list}
        deleteButton={
          ruleId ? <HotelDeleteButton id={ruleId} action={deletePricingRule} redirectTo={list} /> : undefined
        }
      />
    </div>
  );
}
