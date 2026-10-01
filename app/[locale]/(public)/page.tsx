import { setRequestLocale } from "next-intl/server";
import { HomeSectionView, type HomeData } from "@/components/home/sections";
import { startingPrice } from "@/lib/availability/engine";
import { getBanners, getFaqs, getHomeSections, getServices, getTestimonials } from "@/lib/catalog/queries";
import { getHotelCatalog } from "@/lib/hotels/queries";
import { pickLocalized } from "@/lib/i18n/localized";

/** Revalidated by admin edits (revalidateTag) and at least hourly. */
export const revalidate = 3600;

/**
 * Home page: every section, its order, visibility and copy come from
 * `cms_sections`; services, banners and testimonials from their tables.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [sections, services, banners, testimonials, faqs, hotelCatalog] = await Promise.all([
    getHomeSections(),
    getServices(),
    getBanners(),
    getTestimonials(),
    getFaqs(null),
    getHotelCatalog(),
  ]);
  // Featured first, then sponsored, then the admin's sort order.
  const featuredHotels = [...hotelCatalog.hotels]
    .filter((h) => h.isFeatured || h.isSponsored)
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.sortOrder - b.sortOrder)
    .map((h) => {
      const area = hotelCatalog.areas.find((a) => a.id === h.areaId);
      const city = hotelCatalog.cities.find((c) => c.id === h.cityId);
      return {
        slug: h.slug,
        name: h.name,
        place: [area?.name, city?.name]
          .filter((n) => n)
          .map((n) => pickLocalized(n, locale))
          .join(", "),
        image: h.images.find((i) => !i.roomId)?.url ?? null,
        fromPaise: startingPrice(h.rooms, h.plans),
        ratingAvg: h.ratingCount > 0 ? h.ratingAvg : null,
      };
    });
  const data: HomeData = { locale, featuredHotels, services, banners, testimonials, faqs };

  return (
    <>
      {sections.map((section) => (
        <HomeSectionView key={section.key} section={section} data={data} />
      ))}
    </>
  );
}
