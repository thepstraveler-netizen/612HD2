"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/** Lazy, client-only entry points for the Recharts charts (keeps Recharts out of the admin bundle). */

export const LazyTrendChart = dynamic(() => import("./insights-charts").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[19rem] w-full rounded-2xl" />,
});

export const LazyHorizontalBarChart = dynamic(
  () => import("./insights-charts").then((m) => m.HorizontalBarChart),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full rounded-2xl" /> },
);
