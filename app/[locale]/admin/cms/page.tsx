import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

/** The CMS module opens on its first area. */
export default async function CmsIndexPage() {
  redirect({ href: "/admin/cms/services", locale: await getLocale() });
}
