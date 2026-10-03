import { startingPrice } from "@/lib/availability/engine";
import { getHotelCatalog } from "@/lib/hotels/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { ogImage, ogPrice, ogRating, slugFromFile } from "@/lib/seo/og";

export const revalidate = 3600;

/** Share card for a hotel: name, area, rating and "from" price. Falls back to the default card. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const slug = slugFromFile((await params).file);
  try {
    const catalog = slug ? await getHotelCatalog() : null;
    const hotel = catalog?.hotels.find((h) => h.slug === slug);
    if (!catalog || !hotel) return ogImage(null);
    const area = catalog.areas.find((a) => a.id === hotel.areaId);
    const city = catalog.cities.find((c) => c.id === hotel.cityId);
    const place = [area?.name, city?.name]
      .filter((n) => n)
      .map((n) => pickLocalized(n, "en"))
      .join(", ");
    const from = startingPrice(hotel.rooms, hotel.plans);
    const rating = ogRating(hotel.ratingAvg, hotel.ratingCount);
    return ogImage({
      eyebrow: hotel.starRating ? `${hotel.starRating}-star hotel` : "Hotel",
      title: pickLocalized(hotel.name, "en"),
      subtitle: place || undefined,
      meta: [rating, from !== null ? `from ${ogPrice(from)}/night` : null].filter((m): m is string =>
        Boolean(m),
      ),
    });
  } catch (error) {
    console.error("[og] hotel", error);
    return ogImage(null);
  }
}
