"use client";

import { Bike, Building2, Car, House, Luggage, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: "home" | "hotels" | "cabs" | "rides" | "trips"; icon: LucideIcon };

const TABS: Tab[] = [
  { href: "/", label: "home", icon: House },
  { href: "/hotels", label: "hotels", icon: Building2 },
  { href: "/cabs", label: "cabs", icon: Car },
  { href: "/rides", label: "rides", icon: Bike },
  // Signed-out visitors are sent to log in by the account layout.
  { href: "/account/trips", label: "trips", icon: Luggage },
];

/**
 * Pages that pin their own bottom action bar (price + book) or are a
 * checkout step; two stacked bottom bars would eat a third of the screen.
 */
const OWN_BOTTOM_BAR = [
  /^\/hotels\/[^/]+(\/book)?$/,
  /^\/packages\/[^/]+$/,
  /^\/checkout(\/|$)/,
  /^\/(cabs|rides)\/review$/,
  /^\/quote\//,
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Phone-only bottom tab bar (hidden from md up). Renders an in-flow spacer of
 * the same height, so the footer and the last bit of content are never covered.
 */
export function MobileTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  if (OWN_BOTTOM_BAR.some((re) => re.test(pathname))) return null;

  return (
    <>
      <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-bottom))] shrink-0 md:hidden" />
      <nav
        aria-label={t("tabBar")}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgb(11_46_107/0.18)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden print:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="contents">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] leading-tight font-medium transition-colors outline-none focus-visible:bg-accent motion-reduce:transition-none",
                    active ? "text-primary" : "text-muted-foreground active:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-12 place-items-center rounded-full transition-colors motion-reduce:transition-none",
                      active ? "bg-secondary" : "group-active:bg-accent",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" strokeWidth={active ? 2.25 : 1.75} />
                  </span>
                  <span className="max-w-full truncate">{t(label)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
