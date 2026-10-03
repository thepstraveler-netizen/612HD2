import { ImageResponse } from "next/og";
import { OgCard, type OgCardProps } from "@/components/pwa/brand-art";
import { BRAND } from "@/lib/pwa/brand";

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** `radha-residency.png` → `radha-residency`; anything else → null. */
export function slugFromFile(file: string): string | null {
  const match = /^([a-z0-9][a-z0-9-]{0,119})\.png$/.exec(file);
  return match ? match[1] : null;
}

/** Rupees for the share card. The bundled OG font has no ₹ glyph, so "Rs" is spelled out. */
export function ogPrice(paise: number): string {
  return `Rs ${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function ogRating(average: number | null, count: number): string | null {
  if (average === null || count <= 0) return null;
  return `${average.toFixed(1)}/5 · ${count} ${count === 1 ? "review" : "reviews"}`;
}

export function ogImage(props: OgCardProps | null): ImageResponse {
  return new ImageResponse(
    <OgCard {...(props ?? { title: BRAND.tagline, meta: ["Hotels", "Cabs", "Tours", "Delivery"] })} />,
    { ...OG_SIZE, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
