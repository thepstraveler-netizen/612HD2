import type { Metadata, Viewport } from "next";
import { Dancing_Script, Noto_Sans_Devanagari, Plus_Jakarta_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { ErrorReporting } from "@/components/observability/error-reporting";
import { VercelInsights } from "@/components/observability/vercel-insights";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { Providers } from "@/components/providers";
import { BuildWatcher } from "@/components/pwa/build-watcher";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";
import { routing } from "@/i18n/routing";
import { BRAND } from "@/lib/pwa/brand";
import { defaultOgImage, siteUrl } from "@/lib/seo/site";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
  // Only Hindi text needs it (unicode-range), so English pages never fetch it;
  // a preload would make every page download it before the hero renders.
  preload: false,
});
const script = Dancing_Script({ subsets: ["latin"], variable: "--font-script", display: "swap" });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  // Lets fixed bottom bars pad themselves with env(safe-area-inset-bottom) on notched phones.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B2E6B" },
    { media: "(prefers-color-scheme: dark)", color: "#071F4A" },
  ],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  // Canonical + hreflang are per page (lib/seo/metadata.ts); setting them here
  // would make every page without its own claim to be the home page.
  return {
    metadataBase: new URL(siteUrl()),
    applicationName: t("title"),
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
    appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: "default" },
    openGraph: {
      siteName: t("title"),
      locale: locale === "hi" ? "hi_IN" : "en_IN",
      type: "website",
      images: [defaultOgImage()],
    },
    twitter: { card: "summary_large_image", images: [defaultOgImage()] },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${sans.variable} ${devanagari.variable} ${script.variable}`}>
        {/* useSearchParams needs a Suspense boundary to keep pages static. */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <ServiceWorkerRegistration />
        <BuildWatcher />
        <ErrorReporting />
        {process.env.VERCEL ? <VercelInsights /> : null}
      </body>
    </html>
  );
}
