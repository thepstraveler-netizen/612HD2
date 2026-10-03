import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Pills to switch business when the user belongs to more than one (`?v=`). */
export async function VendorSwitcher({
  vendors,
  currentId,
  path,
}: {
  vendors: readonly { id: string; name: string }[];
  currentId: string;
  path: string;
}) {
  if (vendors.length < 2) return null;
  const t = await getTranslations("vendorOrders.nav");
  return (
    <nav aria-label={t("switcher")} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {vendors.map((v) => {
          const active = v.id === currentId;
          return (
            <li key={v.id}>
              <Link
                href={`${path}?v=${v.id}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap",
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                )}
              >
                {v.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
