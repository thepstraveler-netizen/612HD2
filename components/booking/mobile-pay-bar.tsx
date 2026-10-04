"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StickyActionBar } from "./sticky-action-bar";

/**
 * Phone-only price breakdown that folds away under a one-line total. A
 * native <details>, so it works before hydration and with the keyboard.
 * Pairs with {@link MobilePayBar}, whose amount opens it.
 */
export function MobilePriceDetails({
  id,
  title,
  totalLabel,
  total,
  dimmed,
  children,
}: {
  id: string;
  title: string;
  totalLabel: string;
  total: string;
  /** While a new price is being fetched. */
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <details id={id} className="group scroll-mt-24 rounded-2xl border bg-card lg:hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-base font-bold">{title}</span>
          <span className="block text-xs text-muted-foreground">{totalLabel}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={cn("text-lg font-extrabold transition-opacity", dimmed && "opacity-60")}>
            {total}
          </span>
          <ChevronDown
            className="size-5 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className={cn("border-t px-4 pt-3 pb-4 transition-opacity", dimmed && "opacity-60")}>
        {children}
      </div>
    </details>
  );
}

/**
 * The sticky bottom bar on phone checkouts: what is due now and the primary
 * button. Tapping the amount opens the price breakdown ({@link
 * MobilePriceDetails} with `detailsId`). Keeps clear of the home indicator;
 * pages leave about 8rem of bottom padding for it.
 */
export function MobilePayBar({
  label,
  amount,
  detailsId,
  children,
}: {
  label: string;
  amount: string;
  detailsId?: string;
  /** The primary submit button. */
  children: ReactNode;
}) {
  const t = useTranslations("checkout");
  const showDetails = () => {
    const el = document.getElementById(detailsId ?? "");
    if (!(el instanceof HTMLDetailsElement)) return;
    el.open = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    el.querySelector("summary")?.focus({ preventScroll: true });
  };
  const amountBlock = (
    <>
      <span className="block truncate text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 text-lg leading-tight font-extrabold">
        {amount}
        {detailsId ? <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
      </span>
    </>
  );
  return (
    <StickyActionBar className="lg:hidden" innerClassName="flex max-w-6xl items-center justify-between gap-3">
      {detailsId ? (
        <button
          type="button"
          onClick={showDetails}
          aria-label={`${label} ${amount}. ${t("mobileBar.details")}`}
          className="min-h-11 min-w-0 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {amountBlock}
        </button>
      ) : (
        <p className="min-w-0">{amountBlock}</p>
      )}
      <div className="flex shrink-0 [&>*]:min-w-36">{children}</div>
    </StickyActionBar>
  );
}
