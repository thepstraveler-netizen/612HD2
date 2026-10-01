import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TestimonialForm } from "@/components/admin/cms-forms";
import { DeleteButton } from "@/components/admin/delete-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { deleteTestimonial } from "@/lib/cms/actions";
import { createClient } from "@/lib/supabase/server";
import type { TestimonialFormInput } from "@/schemas/cms";

const LIST = "/admin/cms/testimonials";

export default async function EditTestimonialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const { isNew, id } = parseEditId(raw);
  await requirePermission("cms.write", `${LIST}/${raw}`);
  const t = await getTranslations();

  let defaults: TestimonialFormInput = {
    author_name: "",
    author_place: "",
    quote: { en: "", hi: "" },
    rating: 5,
    sort_order: 100,
    is_published: false,
  };
  if (!isNew) {
    const supabase = await createClient();
    const { data } = await supabase.from("testimonials").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    defaults = {
      id: data.id,
      author_name: data.author_name,
      author_place: data.author_place ?? "",
      quote: data.quote,
      rating: data.rating,
      sort_order: data.sort_order,
      is_published: data.is_published,
    };
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={isNew ? t("cms.actions.new") : t("cms.actions.edit")}
        backHref={LIST}
        backLabel={t("cms.nav.testimonials")}
      />
      <TestimonialForm
        defaultValues={defaults}
        listHref={LIST}
        deleteButton={id ? <DeleteButton id={id} action={deleteTestimonial} redirectTo={LIST} /> : undefined}
      />
    </div>
  );
}
