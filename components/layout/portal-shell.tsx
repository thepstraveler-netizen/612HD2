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
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-background/90 px-4 backdrop-blur sm:h-16 sm:gap-2">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <LogoMark className="size-9" />
        </Link>
        <span className="mr-auto min-w-0 truncate ps-1 font-semibold text-heading">{title}</span>
        <LanguageSwitcher />
        <ThemeToggle />
        <UserMenu />
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-3xl min-w-0 flex-1 px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]"
      >
        {children}
      </main>
    </div>
  );
}
