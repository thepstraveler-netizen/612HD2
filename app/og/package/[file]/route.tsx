import { pickLocalized } from "@/lib/i18n/localized";
import { getPackage } from "@/lib/packages/queries";
import { ogImage, ogPrice, ogRating, slugFromFile } from "@/lib/seo/og";
import { getRatingSummary } from "@/lib/seo/queries";

export const revalidate = 3600;

/** Share card for a tour package: title, duration, destinations, rating and "from" price. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const slug = slugFromFile((await params).file);
  try {
    const pkg = slug ? await getPackage(slug) : null;
    if (!pkg) return ogImage(null);
    const rating = await getRatingSummary("packages", pkg.id);
    const duration = `${pkg.nights}N / ${pkg.days}D`;
    return ogImage({
      eyebrow: `Tour package · ${duration}`,
      title: pickLocalized(pkg.title, "en"),
      subtitle: pkg.destinations.length ? pkg.destinations.join(" · ") : undefined,
      meta: [
        ogRating(rating.rating, rating.count),
        pkg.fromPaise !== null ? `from ${ogPrice(pkg.fromPaise)}/person` : null,
      ].filter((m): m is string => Boolean(m)),
    });
  } catch (error) {
    console.error("[og] package", error);
    return ogImage(null);
  }
}
