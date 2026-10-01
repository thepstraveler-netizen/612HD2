import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Logo } from "@/components/shared/logo";
import { TempleSkyline } from "@/components/shared/motifs";
import { Link } from "@/i18n/navigation";

/** Per-user content: never prerender. */
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("brand");
  return (
    <div className="relative flex min-h-dvh flex-col bg-gradient-to-b from-brand-sky to-background">
      <header className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-4">
        <Link href="/" className="rounded-lg">
          <Logo name={t("short")} />
        </Link>
        <LanguageSwitcher />
      </header>
      <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 pb-24">
        {children}
      </main>
      <TempleSkyline className="pointer-events-none absolute bottom-0 h-14 text-brand-navy/10 dark:text-white/5" />
    </div>
  );
}
