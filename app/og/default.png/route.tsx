import { ImageResponse } from "next/og";
import { OgCard } from "@/components/pwa/brand-art";
import { BRAND } from "@/lib/pwa/brand";

/** Default branded share image, rendered once at build time. */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(<OgCard title={BRAND.tagline} meta={["Hotels", "Cabs", "Tours", "Delivery"]} />, {
    width: 1200,
    height: 630,
  });
}
