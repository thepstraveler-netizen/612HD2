"use client";

import { MoveHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
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

/**
 * Sideways-scrolling wrapper for wide input grids (fare tables). The right
 * edge fades while more columns are hidden, with a "swipe" hint on phones;
 * the left edge never fades so a sticky first column stays crisp.
 */
export function ScrollTable({ children, className }: { children: ReactNode; className?: string }) {
  const t = useTranslations("admin.ui");
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setMore(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const mask = more ? "linear-gradient(to right, #000 calc(100% - 40px), transparent)" : undefined;
  return (
    <div className="grid min-w-0 gap-1">
      <div
        ref={ref}
        onScroll={measure}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        className={cn("overflow-x-auto overscroll-x-contain", className)}
      >
        {children}
      </div>
      {more ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground md:hidden" aria-hidden="true">
          <MoveHorizontal className="size-3.5" /> {t("swipeHint")}
        </p>
      ) : null}
    </div>
  );
}
