"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Folds the less-used fields of a filter form away on phones behind a
 * "More filters" toggle (showing how many of them are set), so the list
 * starts on the first screen. From `sm` up the wrapper is `display:
 * contents`: the fields sit in the parent grid exactly as before. Hidden
 * fields still submit with the form.
 */
export function MoreFilters({
  active = 0,
  children,
  className,
}: {
  /** How many of the folded fields currently hold a value. */
  active?: number;
  children: ReactNode;
  /** Classes for the open panel on phones (e.g. a column span in the parent grid). */
  className?: string;
}) {
  const t = useTranslations("admin.ui");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-xl border bg-background px-3.5 text-sm font-medium sm:hidden",
          className,
        )}
      >
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 text-left">{t("moreFilters")}</span>
        {active > 0 ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums">
            {active}
          </span>
        ) : null}
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <div id={id} className={cn(open ? "grid gap-3" : "hidden", "sm:contents", className)}>
        {children}
      </div>
    </>
  );
}
