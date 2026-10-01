import type { ReactNode } from "react";
import { LogoMark } from "@/components/shared/logo";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/** Compact, mobile-first shell shared by the vendor and driver portals. */
export function PortalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="size-9" />
        </Link>
        <span className="mr-auto font-semibold text-heading">{title}</span>
        <LanguageSwitcher />
        <ThemeToggle />
        <UserMenu />
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 p-4">
        {children}
      </main>
    </div>
  );
}
