import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FaqForm } from "@/components/admin/cms-forms";
import { DeleteButton } from "@/components/admin/delete-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { deleteFaq } from "@/lib/cms/actions";
import { pickLocalized } from "@/lib/i18n/localized";
import { createClient } from "@/lib/supabase/server";
import type { FaqFormInput } from "@/schemas/cms";

const LIST = "/admin/cms/faqs";

export default async function EditFaqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { isNew, id } = parseEditId(raw);
  await requirePermission("cms.write", `${LIST}/${raw}`);
  const t = await getTranslations();
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name")
    .is("deleted_at", null)
    .order("sort_order");

  let defaults: FaqFormInput = {
    service_id: "",
    question: { en: "", hi: "" },
    answer: { en: "", hi: "" },
    sort_order: 100,
    is_published: false,
  };
  if (!isNew) {
    const { data } = await supabase.from("faqs").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    defaults = {
      id: data.id,
      service_id: data.service_id ?? "",
      question: data.question,
      answer: data.answer,
      sort_order: data.sort_order,
      is_published: data.is_published,
    };
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={isNew ? t("cms.actions.new") : t("cms.actions.edit")}
        backHref={LIST}
        backLabel={t("cms.nav.faqs")}
      />
      <FaqForm
        defaultValues={defaults}
        services={(services ?? []).map((s) => ({ value: s.id, label: pickLocalized(s.name, locale) }))}
        listHref={LIST}
        deleteButton={id ? <DeleteButton id={id} action={deleteFaq} redirectTo={LIST} /> : undefined}
      />
    </div>
  );
}
