import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { SurchargeForm } from "@/components/admin/cab-catalog-forms";
import { CabDeleteButton } from "@/components/admin/cab-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getSurcharge, listCategories } from "@/lib/cabs/admin";
import { deleteSurcharge } from "@/lib/cabs/admin-actions";
import { NEW_SURCHARGE, surchargeFormValues } from "@/lib/cabs/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";

const LIST = "/admin/cabs/surcharges";

export default async function EditCabSurchargePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("cabs.write", `${LIST}/${raw}`);
  const [t, locale, categories, surcharge] = await Promise.all([
    getTranslations("cabsAdmin"),
    getLocale(),
    listCategories(),
    id ? getSurcharge(id) : null,
  ]);
  if (id && !surcharge) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={surcharge ? pickLocalized(surcharge.name, locale) : t("surcharges.newTitle")}
        backHref={LIST}
        backLabel={t("surcharges.title")}
      />
      <SurchargeForm
        defaultValues={surcharge ? surchargeFormValues(surcharge) : NEW_SURCHARGE}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        listHref={LIST}
        deleteButton={id ? <CabDeleteButton id={id} action={deleteSurcharge} redirectTo={LIST} /> : undefined}
      />
    </div>
  );
}
