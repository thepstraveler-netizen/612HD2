"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Flame, Minus, Plus, ShoppingBag, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { lineKey } from "@/lib/delivery/cart";
import type { MenuItem, StoreMenu } from "@/lib/delivery/types";
import {
  cartCount,
  cartEstimatePaise,
  cartNeedsReplace,
  checkSelection,
  filterMenuItems,
  itemFromPaise,
  itemHasOptions,
  itemQtyInCart,
  itemSoldOut,
  ORDER_CHECKOUT_PATH,
  selectionLabel,
  selectionUnitPaise,
  type CartItemLine,
  type CartShop,
  type CartStoreMeta,
  type MenuFilters,
} from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCart, useHydrated } from "./cart-store";
import { DietMark, ShopTag } from "./diet-mark";

type PendingAdd = { line: CartItemLine };

/**
 * The interactive menu: diet toggles, category chips, item rows, the
 * options sheet (size and add-ons) and a sticky cart bar. The cart keeps one
 * store at a time; adding from another store asks before replacing it.
 */
export function StoreMenuView({
  shop,
  menu,
  locale,
  initialFilters,
  canOrder,
  orderBlock,
}: {
  shop: CartShop;
  menu: StoreMenu;
  locale: string;
  initialFilters: MenuFilters;
  canOrder: boolean;
  orderBlock: "paused" | "closed" | null;
}) {
  const t = useTranslations("shop");
  const [cart, dispatch] = useCart();
  const hydrated = useHydrated();
  const [filters, setFilters] = useState<MenuFilters>(initialFilters);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [pending, setPending] = useState<PendingAdd | null>(null);
  const { store } = menu;
  const meta: CartStoreMeta = { storeId: store.id, shop, slug: store.slug, name: store.name };
  const money = (paise: number) => formatPaise(paise, locale);

  const visible = useMemo(() => filterMenuItems(menu.items, filters), [menu.items, filters]);
  const sections = useMemo(() => {
    const out = menu.categories
      .map((c) => ({
        id: c.id,
        name: pickLocalized(c.name, locale),
        items: visible.filter((i) => i.categoryId === c.id),
      }))
      .filter((s) => s.items.length);
    const loose = visible.filter(
      (i) => i.categoryId === null || !menu.categories.some((c) => c.id === i.categoryId),
    );
    if (loose.length) out.push({ id: "more", name: t("menu.more"), items: loose });
    return out;
  }, [menu.categories, visible, locale, t]);

  const hasDiet = {
    veg:
      shop === "food" && !store.pureVeg && menu.items.some((i) => i.diet === "non_veg" || i.diet === "egg"),
    jain: menu.items.some((i) => i.isJain),
    sattvik: menu.items.some((i) => i.isSattvik),
  };

  function setFilter(key: keyof MenuFilters, on: boolean) {
    const next = { ...filters, [key]: on };
    setFilters(next);
    // Keep the URL shareable without a server round trip.
    const url = new URL(window.location.href);
    if (on) url.searchParams.set(key, "1");
    else url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }

  function add(line: CartItemLine) {
    if (cartNeedsReplace(cart, store.id)) {
      setPending({ line });
      return;
    }
    dispatch({ type: "add", store: meta, line });
    toast.success(t("menu.added", { item: pickLocalized(line.label, locale) }));
  }

  function quickAdd(item: MenuItem) {
    if (itemHasOptions(item)) {
      setSheetItem(item);
      return;
    }
    add({
      itemId: item.id,
      variantId: null,
      addonIds: [],
      qty: 1,
      label: selectionLabel(item, null, []),
      unitPaise: item.pricePaise,
    });
  }

  const sameStore = cart.store?.storeId === store.id;
  const count = hydrated ? cartCount(cart) : 0;

  return (
    <div className="space-y-6">
      {hasDiet.veg || hasDiet.jain || hasDiet.sattvik ? (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">{t("menu.dietFilters")}</legend>
          {(["veg", "jain", "sattvik"] as const)
            .filter((k) => hasDiet[k])
            .map((k) => (
              <label
                key={k}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                  filters[k] ? "border-accent-green bg-accent-green/10 text-accent-green" : "bg-card",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={filters[k]}
                  onChange={(e) => setFilter(k, e.target.checked)}
                />
                {filters[k] ? <Check className="size-4" aria-hidden="true" /> : null}
                {t(`menu.only.${k}`)}
              </label>
            ))}
        </fieldset>
      ) : null}

      {sections.length > 1 ? (
        <nav
          aria-label={t("menu.categories")}
          className="sticky top-16 z-30 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur"
        >
          <ul className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-2 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden">
            {sections.map((s) => (
              <li key={s.id} className="shrink-0 snap-start">
                <a
                  href={`#cat-${s.id}`}
                  className="inline-flex min-h-11 items-center rounded-full border bg-card px-4 text-sm font-medium hover:border-primary"
                >
                  {s.name} <span className="ms-1.5 text-xs text-muted-foreground">{s.items.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {sections.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("menu.noneMatch")}
        </p>
      ) : (
        sections.map((s) => (
          <section
            key={s.id}
            id={`cat-${s.id}`}
            aria-labelledby={`cat-h-${s.id}`}
            className="scroll-mt-32 space-y-3"
          >
            <h2 id={`cat-h-${s.id}`} className="text-lg font-bold text-heading">
              {s.name}
            </h2>
            <ul className="divide-y rounded-2xl border bg-card">
              {s.items.map((item) => (
                <MenuRow
                  key={item.id}
                  item={item}
                  locale={locale}
                  canOrder={canOrder}
                  qtyInCart={hydrated && sameStore ? itemQtyInCart(cart, item.id) : 0}
                  onAdd={() => quickAdd(item)}
                  onDecrease={() => {
                    const key = lineKey({ itemId: item.id, variantId: null, addonIds: [] });
                    const line = cart.lines.find((l) => lineKey(l) === key);
                    if (line) dispatch({ type: "setQty", key, qty: line.qty - 1 });
                  }}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {!canOrder && orderBlock === "closed" ? (
        <p role="note" className="rounded-2xl bg-secondary p-4 text-sm">
          {t("menu.closedNote")}
        </p>
      ) : null}

      {count > 0 && cart.store ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {t("cart.bar", { count, amount: money(cartEstimatePaise(cart)) })}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {sameStore
                  ? t("cart.taxesLater")
                  : t("cart.fromStore", { store: pickLocalized(cart.store.name, locale) })}
              </p>
            </div>
            <Button asChild size="lg">
              <Link href={ORDER_CHECKOUT_PATH}>
                <ShoppingBag /> {t("cart.checkout")}
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <ItemSheet
        item={sheetItem}
        locale={locale}
        onClose={() => setSheetItem(null)}
        onAdd={(line) => {
          setSheetItem(null);
          add(line);
        }}
      />

      <Dialog.Root open={pending !== null} onOpenChange={(o) => (!o ? setPending(null) : undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content
            role="alertdialog"
            className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 space-y-4 rounded-2xl bg-background p-5 shadow-lg"
          >
            <Dialog.Title className="text-lg font-bold">{t("cart.replaceTitle")}</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              {t("cart.replaceBody", {
                current: cart.store ? pickLocalized(cart.store.name, locale) : "",
                next: pickLocalized(store.name, locale),
              })}
            </Dialog.Description>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setPending(null)}>
                {t("cart.keep")}
              </Button>
              <Button
                onClick={() => {
                  if (pending) {
                    dispatch({ type: "add", store: meta, line: pending.line });
                    toast.success(t("menu.added", { item: pickLocalized(pending.line.label, locale) }));
                  }
                  setPending(null);
                }}
              >
                {t("cart.replace")}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function MenuRow({
  item,
  locale,
  canOrder,
  qtyInCart,
  onAdd,
  onDecrease,
}: {
  item: MenuItem;
  locale: string;
  canOrder: boolean;
  qtyInCart: number;
  onAdd: () => void;
  onDecrease: () => void;
}) {
  const t = useTranslations("shop");
  const name = pickLocalized(item.name, locale);
  const description = item.description ? pickLocalized(item.description, locale) : "";
  const soldOut = itemSoldOut(item);
  const price = itemFromPaise(item);
  const options = itemHasOptions(item);
  const money = (paise: number) => formatPaise(paise, locale);
  const showMrp = item.mrpPaise !== null && item.mrpPaise > price.paise && !price.from;

  return (
    <li className={cn("flex gap-4 p-4", soldOut && "opacity-70")}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <DietMark diet={item.diet} label={t(`diet.${item.diet}`)} />
          {item.isBestseller ? (
            <ShopTag tone="orange">
              <Flame className="size-3" aria-hidden="true" /> {t("diet.bestseller")}
            </ShopTag>
          ) : null}
          {item.isJain ? <ShopTag tone="green">{t("diet.jain")}</ShopTag> : null}
          {item.isSattvik ? (
            <ShopTag tone="green">
              <Sparkles className="size-3" aria-hidden="true" /> {t("diet.sattvik")}
            </ShopTag>
          ) : null}
        </div>
        <h3 className="leading-snug font-semibold">{name}</h3>
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-bold">
            {price.from ? t("menu.from", { amount: money(price.paise) }) : money(price.paise)}
          </span>
          {showMrp && item.mrpPaise !== null ? (
            <>
              <span className="text-muted-foreground line-through">
                <span className="sr-only">{t("menu.mrp")} </span>
                {money(item.mrpPaise)}
              </span>
              <span className="text-xs font-semibold text-accent-green">
                {t("menu.off", { percent: Math.round((1 - price.paise / item.mrpPaise) * 100) })}
              </span>
            </>
          ) : null}
          {item.unit ? <span className="text-xs text-muted-foreground">· {item.unit}</span> : null}
        </p>
        {description ? <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex w-28 shrink-0 flex-col items-center gap-2">
        {item.imageUrl ? (
          <span className="relative block size-24 overflow-hidden rounded-xl bg-secondary">
            <Image src={item.imageUrl} alt="" fill sizes="6rem" className="object-cover" />
          </span>
        ) : null}
        {soldOut ? (
          <span className="rounded-lg bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
            {t("menu.soldOut")}
          </span>
        ) : qtyInCart > 0 && !options ? (
          <div className="flex h-11 items-center overflow-hidden rounded-xl border border-primary text-primary">
            <button
              type="button"
              className="grid size-11 place-items-center hover:bg-primary/10"
              onClick={onDecrease}
              aria-label={t("menu.decrease", { item: name })}
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <span className="min-w-6 text-center font-bold" aria-live="polite">
              {qtyInCart}
            </span>
            <button
              type="button"
              className="grid size-11 place-items-center hover:bg-primary/10 disabled:opacity-50"
              onClick={onAdd}
              disabled={!canOrder}
              aria-label={t("menu.increase", { item: name })}
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full border-primary text-primary"
            onClick={onAdd}
            disabled={!canOrder}
            aria-label={t("menu.addAria", { item: name })}
          >
            <Plus /> {qtyInCart > 0 ? t("menu.addMore", { count: qtyInCart }) : t("menu.add")}
          </Button>
        )}
        {options && !soldOut ? (
          <span className="text-[11px] text-muted-foreground">{t("menu.customisable")}</span>
        ) : null}
      </div>
    </li>
  );
}

/** Options sheet: one required size (radio) and add-on groups with their min / max. */
function ItemSheet({
  item,
  locale,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  locale: string;
  onClose: () => void;
  onAdd: (line: CartItemLine) => void;
}) {
  return (
    <Dialog.Root open={item !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-background shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-2xl">
          {item ? <ItemSheetBody key={item.id} item={item} locale={locale} onAdd={onAdd} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ItemSheetBody({
  item,
  locale,
  onAdd,
}: {
  item: MenuItem;
  locale: string;
  onAdd: (line: CartItemLine) => void;
}) {
  const t = useTranslations("shop");
  const firstVariant = item.variants.find((v) => v.isAvailable && (v.stock === null || v.stock > 0));
  const [variantId, setVariantId] = useState<string | null>(firstVariant?.id ?? null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [showErrors, setShowErrors] = useState(false);
  const money = (paise: number) => formatPaise(paise, locale);
  const problem = checkSelection(item, variantId, addonIds);
  const unit = selectionUnitPaise(item, variantId, addonIds);
  const name = pickLocalized(item.name, locale);

  const toggleAddon = (id: string, on: boolean) =>
    setAddonIds((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <DietMark diet={item.diet} label={t(`diet.${item.diet}`)} />
            <Dialog.Title className="text-lg leading-snug font-bold">{name}</Dialog.Title>
          </div>
          <Dialog.Description className="text-sm text-muted-foreground">
            {item.description ? pickLocalized(item.description, locale) : t("menu.chooseOptions")}
          </Dialog.Description>
        </div>
        <Dialog.Close className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-accent">
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">{t("menu.close")}</span>
        </Dialog.Close>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {item.variants.length ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 flex w-full items-center justify-between font-semibold">
              {t("menu.size")}
              <span className="text-xs font-medium text-accent-orange">{t("menu.required")}</span>
            </legend>
            {item.variants.map((v) => {
              const out = !v.isAvailable || (v.stock !== null && v.stock <= 0);
              return (
                <label
                  key={v.id}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                    variantId === v.id && "border-primary ring-1 ring-primary",
                    out && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="variant"
                      className="size-5 accent-[var(--primary)]"
                      checked={variantId === v.id}
                      disabled={out}
                      onChange={() => setVariantId(v.id)}
                    />
                    {pickLocalized(v.name, locale)}
                    {out ? (
                      <span className="text-xs text-muted-foreground">({t("menu.soldOut")})</span>
                    ) : null}
                  </span>
                  <span className="font-semibold">{money(v.pricePaise)}</span>
                </label>
              );
            })}
            {showErrors && problem?.error === "variant_required" ? (
              <p role="alert" className="text-sm text-destructive">
                {t("menu.pickSize")}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {item.addonGroups
          .filter((g) => g.addons.length)
          .map((g) => {
            const picked = g.addons.filter((a) => addonIds.includes(a.id)).length;
            const full = picked >= g.max;
            const groupProblem =
              showErrors && problem && problem.error !== "variant_required" && problem.groupId === g.id
                ? problem
                : null;
            return (
              <fieldset key={g.id} className="space-y-2">
                <legend className="mb-2 flex w-full items-center justify-between font-semibold">
                  {pickLocalized(g.name, locale)}
                  <span className="text-xs font-medium text-muted-foreground">
                    {g.min > 0
                      ? t("menu.pickRange", { min: g.min, max: g.max })
                      : t("menu.pickUpTo", { max: g.max })}
                  </span>
                </legend>
                {g.addons.map((a) => {
                  const checked = addonIds.includes(a.id);
                  const disabled = !a.isAvailable || (!checked && full);
                  return (
                    <label
                      key={a.id}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                        checked && "border-primary",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--primary)]"
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) => toggleAddon(a.id, e.target.checked)}
                        />
                        {pickLocalized(a.name, locale)}
                      </span>
                      <span className="text-muted-foreground">+ {money(a.pricePaise)}</span>
                    </label>
                  );
                })}
                {groupProblem ? (
                  <p role="alert" className="text-sm text-destructive">
                    {groupProblem.error === "addon_min"
                      ? t("menu.pickAtLeast", { count: groupProblem.min })
                      : t("menu.pickAtMost", { count: groupProblem.max })}
                  </p>
                ) : null}
              </fieldset>
            );
          })}
      </div>

      <div className="flex items-center gap-3 border-t p-4">
        <div className="flex h-11 items-center overflow-hidden rounded-xl border">
          <button
            type="button"
            className="grid size-11 place-items-center hover:bg-accent disabled:opacity-40"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            aria-label={t("menu.decrease", { item: name })}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span className="min-w-8 text-center font-bold" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            className="grid size-11 place-items-center hover:bg-accent disabled:opacity-40"
            onClick={() => setQty((q) => Math.min(20, q + 1))}
            disabled={qty >= 20}
            aria-label={t("menu.increase", { item: name })}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        <Button
          type="button"
          size="lg"
          className="flex-1"
          onClick={() => {
            if (problem) {
              setShowErrors(true);
              return;
            }
            onAdd({
              itemId: item.id,
              variantId: item.variants.length ? variantId : null,
              addonIds,
              qty,
              label: selectionLabel(item, variantId, addonIds),
              unitPaise: unit,
            });
          }}
        >
          {t("menu.addTotal", { amount: money(unit * qty) })}
        </Button>
      </div>
    </>
  );
}
