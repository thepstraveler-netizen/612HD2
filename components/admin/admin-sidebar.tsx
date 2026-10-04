"use client";

import { ChevronDown, ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link, usePathname } from "@/i18n/navigation";
import { ADMIN_GROUP_ORDER, ADMIN_MODULE_DEFS, adminModuleHref } from "@/lib/admin/modules";
import type { AdminModuleKey } from "@/lib/permissions/constants";
import { cn } from "@/lib/utils";

/**
 * Collapsible, grouped module navigation. `allowed` comes from the server
 * (modules whose `.read` permission the user holds), so users never see
 * links they cannot open.
 */
export function AdminSidebarNav({
  allowed,
  canAudit,
  onNavigate,
}: {
  allowed: AdminModuleKey[];
  canAudit: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const allowedSet = new Set(allowed);

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const linkClass = (active: boolean) =>
    cn(
      "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none lg:min-h-10",
      active
        ? "bg-sidebar-accent text-white"
        : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-white",
    );

  return (
    <nav aria-label={t("title")} className="flex flex-col gap-2">
      {ADMIN_GROUP_ORDER.map((group) => {
        const modules = ADMIN_MODULE_DEFS.filter((m) => m.group === group && allowedSet.has(m.key));
        const showAudit = group === "system" && canAudit;
        if (modules.length === 0 && !showAudit) return null;
        return (
          <Collapsible key={group} defaultOpen>
            <CollapsibleTrigger className="group flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-xs font-semibold tracking-wider text-sidebar-foreground/60 uppercase hover:text-white">
              {t(`groups.${group}`)}
              <ChevronDown
                className="size-4 transition-transform group-data-[state=closed]:-rotate-90"
                aria-hidden="true"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-0.5 pt-1">
              {modules.map(({ key, icon: Icon }) => {
                const href = adminModuleHref(key);
                const active = isActive(href);
                return (
                  <Link
                    key={key}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={linkClass(active)}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {t(`modules.${key}`)}
                  </Link>
                );
              })}
              {showAudit ? (
                <Link
                  href="/admin/audit"
                  onClick={onNavigate}
                  aria-current={isActive("/admin/audit") ? "page" : undefined}
                  className={linkClass(isActive("/admin/audit"))}
                >
                  <ScrollText className="size-4 shrink-0" aria-hidden="true" />
                  {t("audit")}
                </Link>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </nav>
  );
}
