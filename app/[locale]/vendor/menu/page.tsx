import { UtensilsCrossed } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VendorMenuEntry } from "@/components/delivery/vendor-menu-entry";
import { EmptyState } from "@/components/shared/empty-state";
import { Link } from "@/i18n/navigation";
import { getVendorContext, getVendorMenu, type VendorMenuItem } from "@/lib/delivery/vendor";
import { pickLocalized } from "@/lib/i18n/localized";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Menu and stock for one store (switcher when the vendor has several):
 * mark items, variants and add-ons sold out or back, set stock counts
 * and prices. Saves clear the public menu cache.
 */
export default async function VendorMenuPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendorOrders");
  const ctx = await getVendorContext();
  if (!ctx || ctx.stores.length === 0) {
    return <EmptyState icon={UtensilsCrossed} title={t("noStores.title")} description={t("noStores.body")} />;
  }
  const wanted = (await searchParams).store;
  const store = ctx.stores.find((s) => s.id === wanted) ?? ctx.stores[0];
  const menu = await getVendorMenu(ctx, store.id);
  const items = menu?.items ?? [];
  const sections = [
    ...(menu?.categories ?? []).map((c) => ({
      id: c.id,
      name: pickLocalized(c.name, locale),
      hidden: !c.isActive,
      items: items.filter((i) => i.categoryId === c.id),
    })),
    {
      id: "none",
      name: t("menu.uncategorised"),
      hidden: false,
      items: items.filter(
        (i) => i.categoryId === null || !menu?.categories.some((c) => c.id === i.categoryId),
      ),
    },
  ].filter((s) => s.items.length);

  const entry = (item: VendorMenuItem) => (
    <li key={item.id} className="space-y-3 rounded-2xl border bg-card p-4">
      <VendorMenuEntry
        kind="item"
        id={item.id}
        name={pickLocalized(item.name, locale)}
        available={item.isAvailable}
        pricePaise={item.pricePaise}
        stock={item.trackStock ? item.stock : null}
      />
      {item.variants.length ? (
        <div className="space-y-3 border-t pt-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("menu.variants")}
          </p>
          {item.variants.map((v) => (
            <VendorMenuEntry
              key={v.id}
              kind="variant"
              id={v.id}
              name={pickLocalized(v.name, locale)}
              available={v.isAvailable}
              pricePaise={v.pricePaise}
              stock={v.stock}
              className="pl-3"
            />
          ))}
        </div>
      ) : null}
      {item.addonGroups.map((g) =>
        g.addons.length ? (
          <div key={g.id} className="space-y-3 border-t pt-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {pickLocalized(g.name, locale)}
            </p>
            {g.addons.map((a) => (
              <VendorMenuEntry
                key={a.id}
                kind="addon"
                id={a.id}
                name={pickLocalized(a.name, locale)}
                available={a.isAvailable}
                pricePaise={a.pricePaise}
                className="pl-3"
              />
            ))}
          </div>
        ) : null,
      )}
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("menu.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("menu.lead")}</p>
      </div>

      {ctx.stores.length > 1 ? (
        <nav aria-label={t("menu.switchStore")} className="flex flex-wrap gap-2">
          {ctx.stores.map((s) => (
            <Link
              key={s.id}
              href={{ pathname: "/vendor/menu", query: { store: s.id } }}
              aria-current={s.id === store.id ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium",
                s.id === store.id && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {pickLocalized(s.name, locale)}
            </Link>
          ))}
        </nav>
      ) : null}

      {sections.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title={t("menu.empty")} description={t("menu.emptyHelp")} />
      ) : (
        sections.map((section) => (
          <section key={section.id} aria-labelledby={`cat-${section.id}`} className="space-y-3">
            <h2 id={`cat-${section.id}`} className="flex items-center gap-2 text-base font-semibold">
              {section.name}
              {section.hidden ? (
                <span className="rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
                  {t("menu.hiddenCategory")}
                </span>
              ) : null}
            </h2>
            <ul className="space-y-3">{section.items.map(entry)}</ul>
          </section>
        ))
      )}
      <p className="text-xs text-muted-foreground">{t("menu.help")}</p>
    </div>
  );
}
