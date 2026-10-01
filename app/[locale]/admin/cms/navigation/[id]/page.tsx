import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NavLinkForm } from "@/components/admin/cms-forms";
import { DeleteButton } from "@/components/admin/delete-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { deleteNavLink } from "@/lib/cms/actions";
import { createClient } from "@/lib/supabase/server";
import type { NavLinkFormInput } from "@/schemas/cms";

const LIST = "/admin/cms/navigation";

export default async function EditNavLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { isNew, id } = parseEditId(raw);
  await requirePermission("cms.write", `${LIST}/${raw}`);
  const t = await getTranslations();

  let defaults: NavLinkFormInput = {
    menu: "header",
    label: { en: "", hi: "" },
    href: "/",
    sort_order: 100,
    is_visible: true,
  };
  if (!isNew) {
    const supabase = await createClient();
    const { data } = await supabase.from("navigation_links").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    defaults = {
      id: data.id,
      menu: data.menu,
      label: data.label,
      href: data.href,
      sort_order: data.sort_order,
      is_visible: data.is_visible,
    };
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={isNew ? t("cms.actions.new") : t("cms.actions.edit")}
        backHref={LIST}
        backLabel={t("cms.nav.navigation")}
      />
      <NavLinkForm
        defaultValues={defaults}
        listHref={LIST}
        deleteButton={id ? <DeleteButton id={id} action={deleteNavLink} redirectTo={LIST} /> : undefined}
      />
    </div>
  );
}
