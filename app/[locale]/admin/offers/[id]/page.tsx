import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BannerForm } from "@/components/admin/cms-forms";
import { DeleteButton } from "@/components/admin/delete-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { deleteBanner } from "@/lib/cms/actions";
import { mediaUrl } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import type { BannerFormInput } from "@/schemas/cms";

const LIST = "/admin/offers";

/**
 * Dates are passed to the form as ISO strings and converted to the
 * browser's local time inside the client form (the server's zone is UTC).
 */
export default async function EditBannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { isNew, id } = parseEditId(raw);
  await requirePermission("offers.write", `${LIST}/${raw}`);
  const t = await getTranslations();

  let defaults: BannerFormInput = {
    tab: "all",
    title: { en: "", hi: "" },
    subtitle: { en: "", hi: "" },
    coupon_code: "",
    cta_label: { en: "", hi: "" },
    href: "",
    media_id: null,
    accent: "blue",
    starts_at: "",
    ends_at: "",
    sort_order: 100,
    is_active: false,
  };
  let preview: string | null = null;
  if (!isNew) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("offers_banners")
      .select("*, media:media_id (path)")
      .eq("id", id)
      .maybeSingle();
    if (!data) notFound();
    defaults = {
      id: data.id,
      tab: data.tab,
      title: data.title,
      subtitle: data.subtitle ?? { en: "", hi: "" },
      coupon_code: data.coupon_code ?? "",
      cta_label: data.cta_label ?? { en: "", hi: "" },
      href: data.href ?? "",
      media_id: data.media_id,
      accent: data.accent,
      starts_at: data.starts_at ?? "",
      ends_at: data.ends_at ?? "",
      sort_order: data.sort_order,
      is_active: data.is_active,
    };
    preview = mediaUrl(data.media?.path);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={isNew ? t("cms.actions.new") : t("cms.actions.edit")}
        backHref={LIST}
        backLabel={t("cms.nav.banners")}
      />
      <BannerForm
        defaultValues={defaults}
        imagePreview={preview}
        listHref={LIST}
        deleteButton={id ? <DeleteButton id={id} action={deleteBanner} redirectTo={LIST} /> : undefined}
      />
    </div>
  );
}
