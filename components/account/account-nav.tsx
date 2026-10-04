"use client";

import {
  FileText,
  Gift,
  Heart,
  KeyRound,
  LayoutDashboard,
  Luggage,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { isActiveAccountLink } from "@/lib/account/nav";
import { cn } from "@/lib/utils";
import { TabScroller } from "./tab-scroller";

const LINKS: { href: string; key: string; icon: LucideIcon }[] = [
  { href: "/account", key: "overview", icon: LayoutDashboard },
  { href: "/account/trips", key: "trips", icon: Luggage },
  { href: "/account/wishlist", key: "wishlist", icon: Heart },
  { href: "/account/rewards", key: "rewards", icon: Sparkles },
  { href: "/account/refer", key: "refer", icon: Gift },
  { href: "/account/travellers", key: "travellers", icon: Users },
  { href: "/account/addresses", key: "addresses", icon: MapPin },
  { href: "/account/profile", key: "profile", icon: UserRound },
  { href: "/account/prescriptions", key: "prescriptions", icon: FileText },
  { href: "/account/update-password", key: "password", icon: KeyRound },
  { href: "/account/security", key: "security", icon: ShieldCheck },
];

/**
 * Account sections: a snapping, sideways-scrolling tab row on phones (the
 * current tab is kept in view), a side list from `md` up. The current page
 * is marked with aria-current.
 */
export function AccountNav() {
  const t = useTranslations("account.nav");
  const pathname = usePathname();
  return (
    <TabScroller
      label={t("label")}
      activeKey={pathname}
      className="-mx-4 border-b md:mx-0 md:border-0"
      rowClassName="md:snap-none md:flex-col md:overflow-visible md:px-0"
      fadeClassName="md:hidden"
    >
      {LINKS.map(({ href, key, icon: Icon }) => {
        const active = isActiveAccountLink(pathname, href);
        return (
          <li key={href} className="shrink-0 snap-start">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset motion-reduce:transition-none md:flex md:w-full md:rounded-xl md:border-b-0",
                active
                  ? "border-primary text-foreground md:bg-secondary md:text-secondary-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground md:hover:bg-accent",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {t(key)}
            </Link>
          </li>
        );
      })}
    </TabScroller>
  );
}
