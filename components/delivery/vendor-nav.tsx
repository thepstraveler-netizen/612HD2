"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/vendor", key: "home" },
  { href: "/vendor/orders", key: "orders" },
  { href: "/vendor/menu", key: "menu" },
  { href: "/vendor/ratings", key: "ratings" },
  { href: "/vendor/riders", key: "riders" },
] as const;

/** Section tabs of the vendor dashboard; scrolls sideways on small phones. */
export function VendorNav() {
  const t = useTranslations("vendorOrders.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="-mx-4 mb-4 overflow-x-auto border-b px-4">
      <ul className="flex gap-1">
        {LINKS.map(({ href, key }) => {
          const active = href === "/vendor" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap",
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
      </ul>
    </nav>
  );
}
