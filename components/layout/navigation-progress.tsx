"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { shouldHardNavigate } from "@/lib/pwa/build";
import { changesPage, NAVIGATION_START } from "@/lib/navigation/progress";

const SHOW_AFTER_MS = 120;
const GIVE_UP_MS = 15_000;

/**
 * A thin bar across the top that appears as soon as a link or a navigating
 * button is clicked and finishes when the next page is on screen (D-105), so
 * a click always shows that something is happening, even while the server
 * is still rendering. Public pages use this instead of route loading screens,
 * which would turn "page not found" into a 200 response.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  useEffect(() => {
    const start = () => {
      clearTimers();
      timers.current.push(
        window.setTimeout(() => setState("running"), SHOW_AFTER_MS),
        window.setTimeout(() => setState("idle"), GIVE_UP_MS),
      );
    };
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!shouldHardNavigate(event, anchor, window.location.origin)) return;
      if (changesPage(anchor.href, window.location.href)) start();
    };
    // Bubble phase: a click another handler cancelled never starts the bar.
    document.addEventListener("click", onClick);
    window.addEventListener(NAVIGATION_START, start);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(NAVIGATION_START, start);
      clearTimers();
    };
  }, []);

  // The URL changed: the new page is rendering, finish the bar.
  useEffect(() => {
    clearTimers();
    setState((s) => (s === "running" ? "done" : "idle"));
    timers.current.push(window.setTimeout(() => setState("idle"), 300));
  }, [pathname, search]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className={
          state === "running"
            ? "h-full w-[85%] bg-primary transition-[width] duration-[8000ms] ease-out motion-reduce:transition-none"
            : state === "done"
              ? "h-full w-full bg-primary opacity-0 transition-[width,opacity] duration-300"
              : "h-full w-0 opacity-0"
        }
      />
    </div>
  );
}
