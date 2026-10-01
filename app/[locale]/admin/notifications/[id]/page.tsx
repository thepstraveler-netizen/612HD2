import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { NotificationTemplateForm } from "@/components/admin/notification-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { parseEditId } from "@/lib/admin/params";
import { requirePermission } from "@/lib/auth/guards";
import { getNotificationTemplate } from "@/lib/bookings/admin";
import { publicEnv } from "@/lib/env";
import { NOTIFICATION_CHANNELS, type TemplateFormInput } from "@/schemas/booking-admin";

const LIST = "/admin/notifications";

/** `?key=&channel=&locale=` pre-fill a new template (e.g. the Hindi SMS of an existing key). */
const prefillSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9_.]{3,60}$/)
    .catch(""),
  channel: z.enum(NOTIFICATION_CHANNELS).catch("email"),
  locale: z.enum(["en", "hi"]).catch("en"),
});

export default async function EditNotificationTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: raw } = await params;
  const { isNew, id } = parseEditId(raw);
  await requirePermission("notifications.write", `${LIST}/${raw}`);
  const t = await getTranslations("bookingsAdmin.notifications");

  let defaults: TemplateFormInput;
  if (id) {
    const row = await getNotificationTemplate(id);
    if (!row) notFound();
    defaults = {
      id: row.id,
      key: row.key,
      channel: row.channel,
      locale: row.locale,
      subject: row.subject ?? "",
      body: row.body,
      is_active: row.is_active,
    };
  } else {
    const sp = await searchParams;
    const prefill = prefillSchema.parse({ key: sp.key, channel: sp.channel, locale: sp.locale });
    defaults = { ...prefill, subject: "", body: "", is_active: true };
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={isNew ? t("new") : `${defaults.key} · ${defaults.channel} · ${defaults.locale}`}
        backHref={LIST}
        backLabel={t("backToList")}
      />
      <NotificationTemplateForm
        defaultValues={defaults}
        listHref={LIST}
        siteUrl={publicEnv().NEXT_PUBLIC_SITE_URL}
      />
    </div>
  );
}
