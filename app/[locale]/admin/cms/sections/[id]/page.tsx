import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SectionForm } from "@/components/admin/cms-forms";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

const LIST = "/admin/cms/sections";

/** Home sections are fixed slots seeded by migration: they can be edited, hidden and reordered, not created. */
export default async function EditSectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { isNew, id } = parseEditId(raw);
  if (isNew) notFound();
  await requirePermission("cms.write", `${LIST}/${raw}`);
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase.from("cms_sections").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`${t("cms.actions.edit")} · ${data.type}`}
        backHref={LIST}
        backLabel={t("cms.nav.sections")}
      />
      <SectionForm
        listHref={LIST}
        defaultValues={{
          id: data.id,
          title: data.title ?? { en: "", hi: "" },
          subtitle: data.subtitle ?? { en: "", hi: "" },
          contentJson: JSON.stringify(data.content, null, 2),
          sort_order: data.sort_order,
          is_visible: data.is_visible,
        }}
      />
    </div>
  );
}
