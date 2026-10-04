"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A bar pinned to the bottom of the screen for the one thing to do next,
 * clear of the phone's home indicator. While shown it publishes its height
 * as `--sticky-bar-h` on <html>, so a page can pad its end by exactly that
 * much (`pb-[calc(var(--sticky-bar-h,0px)+…)]`) and nothing hides under it.
 */
export function StickyActionBar({
  label,
  className,
  innerClassName,
  children,
}: {
  /** Names the bar for screen readers (it is a landmark region). */
  label?: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--sticky-bar-h", `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--sticky-bar-h");
    };
  }, []);

  return (
    <div
      ref={ref}
      role={label ? "region" : undefined}
      aria-label={label}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.08)]",
        className,
      )}
    >
      <div className={cn("mx-auto max-w-md", innerClassName)}>{children}</div>
    </div>
  );
}
