import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Section heading on a navy brush-stroke ribbon, echoing the poster. */
export function SectionTitle({
  children,
  lead,
  as: Heading = "h2",
  className,
}: {
  children: ReactNode;
  lead?: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <Heading className="relative inline-flex items-center px-6 py-2 text-xl font-bold !text-white sm:text-2xl">
        <svg
          aria-hidden="true"
          viewBox="0 0 300 60"
          preserveAspectRatio="none"
          className="absolute inset-0 -z-10 size-full"
        >
          <path
            d="M6 14C40 4 120 6 200 5c40 0 80 2 94 6 4 6 2 12-6 16 8 4 9 12 2 18-30 8-110 9-190 10-40 1-80-1-94-5-6-6-4-12 4-16-9-4-9-12 2-20z"
            fill="var(--brand-navy)"
          />
          <path
            d="M14 48c60 4 160 2 270-4"
            stroke="var(--brand-blue)"
            strokeWidth="3"
            fill="none"
            opacity=".55"
          />
        </svg>
        {children}
      </Heading>
      {lead ? <p className="max-w-2xl text-muted-foreground">{lead}</p> : null}
    </div>
  );
}
