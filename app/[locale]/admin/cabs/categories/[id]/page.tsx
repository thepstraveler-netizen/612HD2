import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CategoryForm } from "@/components/admin/cab-category-form";
import { CabDeleteButton } from "@/components/admin/cab-shared";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getCategory } from "@/lib/cabs/admin";
import { deleteCategory } from "@/lib/cabs/admin-actions";
import { NEW_CATEGORY, categoryFormValues } from "@/lib/cabs/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";

const LIST = "/admin/cabs/categories";

export default async function EditCabCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { id } = parseEditId(raw);
  await requirePermission("cabs.write", `${LIST}/${raw}`);
  const [t, locale, detail] = await Promise.all([
    getTranslations("cabsAdmin"),
    getLocale(),
    id ? getCategory(id) : null,
  ]);
  if (id && !detail) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={detail ? pickLocalized(detail.category.name, locale) : t("categories.newTitle")}
        backHref={LIST}
        backLabel={t("categories.title")}
      />
      <CategoryForm
        defaultValues={detail ? categoryFormValues(detail.category, detail.models) : NEW_CATEGORY}
        imageUrl={detail?.imageUrl ?? null}
        listHref={LIST}
        deleteButton={
          id ? (
            <CabDeleteButton
              id={id}
              action={deleteCategory}
              redirectTo={LIST}
              confirmText={t("categories.confirmDelete")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
