import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminSidebarNav } from "@/components/admin/admin-sidebar";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { LogoMark } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { enforceMfa } from "@/lib/mfa/server";
import { hasPermission, visibleModules } from "@/lib/permissions/check";

/** Per-user content: never prerender. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Admin shell. Entry requires at least one module's `.read` permission; each
 * page then calls requirePermission() for its own module.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireUser("/admin", { mfa: false });
  const allowed = visibleModules(session.permissions);
  if (allowed.length === 0) redirect({ href: "/forbidden", locale: await getLocale() });
  // Staff two-step sign-in (each page's requirePermission repeats it with its own `next`).
  await enforceMfa(session, "/admin");
  const canAudit = hasPermission(session.permissions, "audit.read");
  const t = await getTranslations("admin");

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 overflow-y-auto bg-sidebar p-3 text-sidebar-foreground lg:flex">
        <Link href="/admin" className="flex items-center gap-2 px-2 py-2">
          <LogoMark className="size-9" />
          <span className="font-semibold text-white">{t("title")}</span>
        </Link>
        <AdminSidebarNav allowed={allowed} canAudit={canAudit} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
          <AdminMobileNav allowed={allowed} canAudit={canAudit} />
          <div className="mr-auto" />
          <Button asChild variant="ghost" size="sm" className="h-10">
            <Link href="/">
              <ExternalLink /> <span className="hidden sm:inline">{t("openSite")}</span>
            </Link>
          </Button>
          <LanguageSwitcher />
          <ThemeToggle />
          <UserMenu />
        </header>
        <main id="main" className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
