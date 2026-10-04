"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A sideways-scrolling row of section tabs for phones: snaps to tabs, hides
 * the scrollbar, keeps the current tab (`aria-current="page"`) in view and
 * fades the edge that has more tabs behind it. `rowClassName` can switch the
 * row to another layout from a breakpoint up (the fades hide with
 * `fadeClassName`).
 */
export function TabScroller({
  label,
  activeKey,
  className,
  rowClassName,
  fadeClassName,
  children,
}: {
  label: string;
  /** Changes when the current tab changes (usually the pathname). */
  activeKey: string;
  className?: string;
  rowClassName?: string;
  fadeClassName?: string;
  children: ReactNode;
}) {
  const row = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 4, end: max > 4 && el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (current && el.scrollWidth > el.clientWidth) {
      // Centre the current tab without moving the page vertically.
      const offset = current.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      el.scrollLeft = offset - (el.clientWidth - current.offsetWidth) / 2;
    }
    measure();
  }, [activeKey, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <nav aria-label={label} className={cn("relative", className)}>
      <ul
        ref={row}
        onScroll={measure}
        className={cn(
          "flex snap-x snap-proximity scroll-px-4 [scrollbar-width:none] gap-1 overflow-x-auto overscroll-x-contain px-4 [&::-webkit-scrollbar]:hidden",
          rowClassName,
        )}
      >
        {children}
      </ul>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-0 bottom-px left-0 w-8 bg-gradient-to-r from-background to-transparent transition-opacity motion-reduce:transition-none",
          edges.start ? "opacity-100" : "opacity-0",
          fadeClassName,
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-0 right-0 bottom-px w-8 bg-gradient-to-l from-background to-transparent transition-opacity motion-reduce:transition-none",
          edges.end ? "opacity-100" : "opacity-0",
          fadeClassName,
        )}
      />
    </nav>
  );
}
