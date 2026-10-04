"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { filterPackages } from "@/lib/packages/ui";
import { cn } from "@/lib/utils";

export type FilterItem = {
  id: string;
  category: string;
  title: { en: string; hi?: string | null };
  destinations: string[];
  node: ReactNode;
};

/**
 * Category chips over the server-rendered cards. Filtering runs in the
 * browser so the listing stays a cached page; `?category=` and the home
 * search's `?q=` still deep-link (read after mount, kept in the URL).
 */
export function PackageFilter({
  categories,
  items,
  empty,
}: {
  categories: { key: string; label: string }[];
  items: FilterItem[];
  empty: ReactNode;
}) {
  const t = useTranslations("packages.listing");
  const [category, setCategory] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("category");
    if (fromUrl && categories.some((c) => c.key === fromUrl)) setCategory(fromUrl);
    setQ(params.get("q")?.slice(0, 80) ?? "");
  }, [categories]);

  const choose = (next: string | null) => {
    setCategory(next);
    try {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("category", next);
      else url.searchParams.delete("category");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // URL sync is a convenience only.
    }
  };

  const shown = filterPackages(items, { category, q });
  const chip = (key: string | null, label: string) => {
    const on = category === key;
    return (
      <li key={key ?? "all"} className="shrink-0 snap-start">
        <button
          type="button"
          aria-pressed={on}
          onClick={() => choose(key)}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition",
            on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary",
          )}
        >
          {on ? <Check className="size-4" aria-hidden="true" /> : null} {label}
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {categories.length > 1 ? (
        <nav aria-label={t("filtersTitle")} className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="size-4" aria-hidden="true" /> {t("filtersTitle")}
          </p>
          <ul className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap [&::-webkit-scrollbar]:hidden">
            {chip(null, t("all"))}
            {categories.map((c) => chip(c.key, c.label))}
          </ul>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {q ? (
          <p className="text-sm">
            {t("searchFor", { q })}{" "}
            <button
              type="button"
              className="min-h-11 font-medium text-primary hover:underline"
              onClick={() => setQ("")}
            >
              {t("clearSearch")}
            </button>
          </p>
        ) : (
          <span />
        )}
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("count", { count: shown.length })}
        </p>
      </div>
      {shown.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => (
            <li key={item.id}>{item.node}</li>
          ))}
        </ul>
      ) : items.length ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
          <p className="font-semibold">{t("noneTitle")}</p>
          <button
            type="button"
            className="min-h-11 font-medium text-primary hover:underline"
            onClick={() => {
              choose(null);
              setQ("");
            }}
          >
            {t("showAll")}
          </button>
        </div>
      ) : (
        empty
      )}
    </div>
  );
}
