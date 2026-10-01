import { getTranslations } from "next-intl/server";
import { AdminSubnav } from "./page-header";

export const CMS_AREAS = ["services", "sections", "testimonials", "faqs", "navigation"] as const;
export type CmsArea = (typeof CMS_AREAS)[number];

export async function CmsSubnav({ active }: { active: CmsArea }) {
  const t = await getTranslations("cms.nav");
  return (
    <AdminSubnav
      active={active}
      items={CMS_AREAS.map((key) => ({ key, href: `/admin/cms/${key}`, label: t(key) }))}
    />
  );
}
