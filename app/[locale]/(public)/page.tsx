import { setRequestLocale } from "next-intl/server";
import { HomeSectionView, type HomeData } from "@/components/home/sections";
import { getBanners, getFaqs, getHomeSections, getServices, getTestimonials } from "@/lib/catalog/queries";

/** Revalidated by admin edits (revalidateTag) and at least hourly. */
export const revalidate = 3600;

/**
 * Home page: every section, its order, visibility and copy come from
 * `cms_sections`; services, banners and testimonials from their tables.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [sections, services, banners, testimonials, faqs] = await Promise.all([
    getHomeSections(),
    getServices(),
    getBanners(),
    getTestimonials(),
    getFaqs(null),
  ]);
  const data: HomeData = { locale, services, banners, testimonials, faqs };

  return (
    <>
      {sections.map((section) => (
        <HomeSectionView key={section.key} section={section} data={data} />
      ))}
    </>
  );
}
