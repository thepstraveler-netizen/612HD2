import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { DeliveryMenuEditor } from "@/components/admin/delivery-menu-editor";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/lib/auth/guards";
import { getAdminMenu, getAdminStore } from "@/lib/delivery/admin";
import { pickLocalized } from "@/lib/i18n/localized";
import { FOOD_KINDS } from "@/schemas/delivery-admin";

/** A restaurant's or grocery store's menu: categories, items, variants and add-ons. */
export default async function StoreMenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requirePermission("food.write", `/admin/food/stores/${id}/menu`);
  const [t, locale, found] = await Promise.all([
    getTranslations("deliveryAdmin"),
    getLocale(),
    getAdminStore(id, FOOD_KINDS),
  ]);
  if (!found) notFound();
  const menu = await getAdminMenu(id);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("menu.title", { store: pickLocalized(found.store.name, locale) })}
        lead={t("menu.lead")}
        backHref={`/admin/food/stores/${id}`}
        backLabel={pickLocalized(found.store.name, locale)}
      />
      <DeliveryMenuEditor storeId={id} kind={found.store.kind} menu={menu} />
    </div>
  );
}
