import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/pwa/brand";

/** Web app manifest (served at /manifest.webmanifest). Icons come from app/icons/[name]/route.tsx. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "en-IN",
    dir: "ltr",
    theme_color: BRAND.navy,
    background_color: BRAND.skySoft,
    categories: ["travel", "lifestyle", "food"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Hotels", url: "/hotels", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Cabs", url: "/cabs", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My trips", url: "/account/trips", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
