import { ImageResponse } from "next/og";
import { IconArt } from "@/components/pwa/brand-art";
import { ICONS, isIconName } from "@/lib/pwa/brand";

/** PWA / apple-touch icons, drawn with next/og and prerendered at build time. */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isIconName(name)) return new Response("Not found", { status: 404 });
  const { size, maskable } = ICONS[name];
  return new ImageResponse(<IconArt size={size} maskable={maskable} />, {
    width: size,
    height: size,
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
