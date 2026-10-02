import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/shared/logo";

/** Live order state from a secret link: never prerender or cache. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rider");
  return { title: t("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Minimal phone-first shell for the rider's order link (no site header, no login). */
export default async function RiderOrderLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("rider");
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center gap-2 bg-brand-navy px-4 py-3 text-white">
        <LogoMark className="size-8" />
        <span className="font-semibold">{t("header")}</span>
      </header>
      <main id="main" className="mx-auto max-w-md space-y-4 px-4 py-5 pb-10">
        {children}
      </main>
    </div>
  );
}
