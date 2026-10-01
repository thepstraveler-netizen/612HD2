import { useTranslations } from "next-intl";
import { Logo } from "@/components/shared/logo";
import { Link } from "@/i18n/navigation";
import { MAIN_NAV } from "@/lib/navigation";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function SiteHeader() {
  const t = useTranslations();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t("common.skipToContent")}
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4">
        <MobileNav />
        <Link
          href="/"
          className="mr-auto rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none xl:mr-0"
        >
          <Logo name={t("brand.short")} strapline={t("brand.strapline")} />
        </Link>
        <nav
          aria-label={t("nav.main")}
          className="mx-2 hidden flex-1 items-center justify-center overflow-x-auto xl:flex"
        >
          {MAIN_NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="rounded-lg px-2 py-2 text-sm font-medium whitespace-nowrap text-foreground/80 hover:bg-accent hover:text-accent-foreground"
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
