import { createNavigation } from "next-intl/navigation";
import { useMemo } from "react";
import { startNavigationProgress } from "@/lib/navigation/progress";
import { routing } from "./routing";

const navigation = createNavigation(routing);

/** Locale-aware wrappers around Next.js navigation APIs. */
export const { Link, redirect, usePathname, getPathname } = navigation;

type Router = ReturnType<typeof navigation.useRouter>;

/**
 * next-intl's router, plus: push and replace start the top navigation bar
 * (components/layout/navigation-progress.tsx), so a button that navigates
 * responds at once like a link does (D-105).
 */
export function useRouter(): Router {
  const router = navigation.useRouter();
  return useMemo(
    () => ({
      ...router,
      push: ((...args: Parameters<Router["push"]>) => {
        startNavigationProgress();
        router.push(...args);
      }) as Router["push"],
      replace: ((...args: Parameters<Router["replace"]>) => {
        startNavigationProgress();
        router.replace(...args);
      }) as Router["replace"],
    }),
    [router],
  );
}
