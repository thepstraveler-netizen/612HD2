import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PackageForm } from "@/components/admin/cab-catalog-forms";
import { CabDeleteButton } from "@/components/admin/cab-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getPackage, listCategories } from "@/lib/cabs/admin";
import { deletePackage } from "@/lib/cabs/admin-actions";
import { newPackageValues, packageFormValues } from "@/lib/cabs/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";

const LIST = "/admin/cabs/packages";

export default async function EditCabPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("cabs.write", `${LIST}/${raw}`);
  const [t, locale, categories, detail] = await Promise.all([
    getTranslations("cabsAdmin"),
    getLocale(),
    listCategories(),
    id ? getPackage(id) : null,
  ]);
  if (id && !detail) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={detail ? pickLocalized(detail.pkg.name, locale) : t("packages.newTitle")}
        backHref={LIST}
        backLabel={t("packages.title")}
      />
      <PackageForm
        defaultValues={
          detail ? packageFormValues(detail.pkg, categories, detail.fares) : newPackageValues(categories)
        }
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        listHref={LIST}
        deleteButton={
          id ? (
            <CabDeleteButton
              id={id}
              action={deletePackage}
              redirectTo={LIST}
              confirmText={t("packages.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
