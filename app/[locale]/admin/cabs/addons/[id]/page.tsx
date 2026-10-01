import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AddonForm } from "@/components/admin/cab-catalog-forms";
import { CabDeleteButton } from "@/components/admin/cab-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getAddon, listCategories } from "@/lib/cabs/admin";
import { deleteAddon } from "@/lib/cabs/admin-actions";
import { NEW_ADDON, addonFormValues } from "@/lib/cabs/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";

const LIST = "/admin/cabs/addons";

export default async function EditCabAddonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("cabs.write", `${LIST}/${raw}`);
  const [t, locale, categories, addon] = await Promise.all([
    getTranslations("cabsAdmin"),
    getLocale(),
    listCategories(),
    id ? getAddon(id) : null,
  ]);
  if (id && !addon) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={addon ? pickLocalized(addon.name, locale) : t("addons.newTitle")}
        backHref={LIST}
        backLabel={t("addons.title")}
      />
      <AddonForm
        defaultValues={addon ? addonFormValues(addon) : NEW_ADDON}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        listHref={LIST}
        deleteButton={id ? <CabDeleteButton id={id} action={deleteAddon} redirectTo={LIST} /> : undefined}
      />
    </div>
  );
}
