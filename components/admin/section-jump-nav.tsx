"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ScrollRow } from "./scroll-row";

export type JumpItem = { id: string; label: string; count?: number };

/** Admin header (h-16) plus this bar, so a jumped-to section starts below both. */
const STICKY_OFFSET = 64 + 60;

/**
 * Sticky row of jump links for long admin pages (settings, hotel and
 * package editors, the dispatch board). The section in view is highlighted
 * as you scroll; links are plain `#id` anchors so they work without JS.
 */
export function SectionJumpNav({
  items,
  label,
  className,
}: {
  items: JumpItem[];
  label: string;
  className?: string;
}) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const targets = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        setActive(visible[0].target.id);
      },
      { rootMargin: `-${STICKY_OFFSET}px 0px -55% 0px` },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <div
      className={cn(
        "sticky top-16 z-20 -mx-4 min-w-0 border-b bg-background/95 py-2 backdrop-blur sm:-mx-6",
        className,
      )}
    >
      <ScrollRow as="nav" label={label} activeKey={active} innerClassName="px-4 sm:px-6">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              data-active={current}
              aria-current={current ? "location" : undefined}
              onClick={(e) => {
                const el = document.getElementById(item.id);
                if (!el) return;
                e.preventDefault();
                const top = el.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET + 8;
                const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
                history.replaceState(null, "", `#${item.id}`);
                setActive(item.id);
              }}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                current ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-accent",
              )}
            >
              {item.label}
              {item.count !== undefined ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    current ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </a>
          );
        })}
      </ScrollRow>
    </div>
  );
}
