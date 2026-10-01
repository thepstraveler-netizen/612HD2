import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ServiceForm } from "@/components/admin/cms-forms";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { mediaUrl } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import type { ServiceFormInput } from "@/schemas/cms";

const LIST = "/admin/cms/services";

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { isNew, id } = parseEditId(raw);
  await requirePermission("cms.write", `${LIST}/${raw}`);
  const t = await getTranslations();

  let defaults: ServiceFormInput = {
    slug: "",
    kind: "enquiry",
    accent: "blue",
    icon: "sparkles",
    name: { en: "", hi: "" },
    summary: { en: "", hi: "" },
    description: { en: "", hi: "" },
    highlights: [],
    cta_label: { en: "", hi: "" },
    hero_media_id: null,
    sort_order: 100,
    is_published: false,
    show_in_nav: false,
  };
  let preview: string | null = null;

  if (!isNew) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("services")
      .select("*, media:hero_media_id (path)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) notFound();
    defaults = {
      id: data.id,
      slug: data.slug,
      kind: data.kind,
      accent: data.accent,
      icon: data.icon,
      name: data.name,
      summary: data.summary,
      description: data.description,
      highlights: data.highlights,
      cta_label: data.cta_label ?? { en: "", hi: "" },
      hero_media_id: data.hero_media_id,
      sort_order: data.sort_order,
      is_published: data.is_published,
      show_in_nav: data.show_in_nav,
    };
    preview = mediaUrl(data.media?.path);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={isNew ? t("cms.actions.new") : t("cms.actions.edit")}
        backHref={LIST}
        backLabel={t("cms.nav.services")}
      />
      <ServiceForm defaultValues={defaults} heroPreview={preview} listHref={LIST} />
    </div>
  );
}
