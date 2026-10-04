"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One horizontally scrolling row (tabs, chips, kanban columns): snap
 * points, no visible scrollbar, edges that fade while there is more to
 * scroll, and the `[aria-current]` / `[data-active]` child centred on load
 * so the current tab is never hidden off-screen.
 */
export function ScrollRow({
  children,
  className,
  innerClassName,
  label,
  as: Tag = "div",
  activeKey,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  /** aria-label for the wrapping landmark when `as="nav"`. */
  label?: string;
  as?: "div" | "nav";
  /** Re-centre the active child when this changes (e.g. the current section). */
  activeKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 4, end: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>("[aria-current], [data-active='true']");
    if (active) {
      const left = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      el.scrollTo({ left: Math.max(0, left), behavior: activeKey === undefined ? "auto" : "smooth" });
    }
    measure();
  }, [activeKey, measure]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const fade = 24;
  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? "transparent" : "#000"} 0, #000 ${fade}px, #000 calc(100% - ${fade}px), ${edges.end ? "transparent" : "#000"} 100%)`
      : undefined;

  return (
    <Tag aria-label={label} className={cn("relative min-w-0", className)}>
      <div
        ref={ref}
        onScroll={measure}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        className={cn(
          "flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-1 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden [&>*]:snap-start",
          innerClassName,
        )}
      >
        {children}
      </div>
    </Tag>
  );
}
