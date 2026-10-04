"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A phone-only bar pinned to the bottom of the screen: price on the left,
 * primary action on the right. Hidden from lg up, where the page's own
 * sticky sidebar does the job. The public layout pads itself while one is on
 * the page (`has-[[data-action-bar]]`), so the footer is never covered; the
 * bottom tab bar is switched off on these routes (components/layout/mobile-tab-bar.tsx).
 *
 * `hideWhileVisible`: the id of the on-page booking panel. While it is on
 * screen the bar slides away, so the same price and button never show twice.
 */
export function MobileActionBar({
  children,
  label,
  hideWhileVisible,
  className,
}: {
  children: ReactNode;
  /** Accessible name for the region, e.g. "Book this stay". */
  label: string;
  hideWhileVisible?: string;
  className?: string;
}) {
  // Starts hidden when watching, so a panel that is already on screen never flashes the bar.
  const [hidden, setHidden] = useState(Boolean(hideWhileVisible));

  useEffect(() => {
    const target = hideWhileVisible ? document.getElementById(hideWhileVisible) : null;
    if (!target) {
      setHidden(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting), {
      threshold: 0.15,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hideWhileVisible]);

  return (
    <div
      role="region"
      aria-label={label}
      aria-hidden={hidden || undefined}
      inert={hidden}
      data-action-bar=""
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_-8px_rgb(11_46_107/0.2)] backdrop-blur transition-transform duration-300 supports-[backdrop-filter]:bg-background/85 motion-reduce:transition-none lg:hidden print:hidden",
        hidden && "translate-y-full",
        className,
      )}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">{children}</div>
    </div>
  );
}

/** The price side of a MobileActionBar: a small caption over a bold amount. */
export function ActionBarPrice({
  caption,
  amount,
  note,
}: {
  caption?: string;
  amount: string;
  note?: string;
}) {
  return (
    <p className="min-w-0 leading-tight">
      {caption ? <span className="block truncate text-xs text-muted-foreground">{caption}</span> : null}
      <span className="text-lg font-extrabold text-heading">{amount}</span>
      {note ? <span className="text-xs text-muted-foreground"> {note}</span> : null}
    </p>
  );
}
