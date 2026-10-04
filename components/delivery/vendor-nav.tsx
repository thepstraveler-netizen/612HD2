"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { TabScroller } from "@/components/account/tab-scroller";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/vendor", key: "home", stores: false },
  { href: "/vendor/earnings", key: "earnings", stores: false },
  { href: "/vendor/business", key: "business", stores: false },
  { href: "/vendor/orders", key: "orders", stores: true },
  { href: "/vendor/menu", key: "menu", stores: true },
  { href: "/vendor/ratings", key: "ratings", stores: true },
  { href: "/vendor/riders", key: "riders", stores: true },
] as const;

/**
 * Section tabs of the vendor dashboard; scrolls sideways on small phones.
 * Store screens (orders, menu, ratings, riders) show only to vendors with
 * stores. The chosen business (`?v=`) carries across tabs.
 */
export function VendorNav({ showStores }: { showStores: boolean }) {
  const t = useTranslations("vendorOrders.nav");
  const pathname = usePathname();
  const vendor = useSearchParams().get("v");
  const query = vendor && /^[0-9a-f-]{36}$/i.test(vendor) ? `?v=${vendor}` : "";
  return (
    <TabScroller label={t("label")} activeKey={pathname} className="-mx-4 mb-4 border-b">
      {LINKS.filter((l) => showStores || !l.stores).map(({ href, key, stores }) => {
        const active = href === "/vendor" ? pathname === href : pathname.startsWith(href);
        return (
          <li key={href} className="shrink-0 snap-start">
            <Link
              href={stores ? href : `${href}${query}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(key)}
            </Link>
          </li>
        );
      })}
    </TabScroller>
  );
}
