import { cn } from "@/lib/utils";

/** Stylised Vrindavan temple skyline silhouette for hero and footer bands. */
export function TempleSkyline({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 120"
      preserveAspectRatio="none"
      className={cn("w-full", className)}
    >
      <path
        fill="currentColor"
        d="M0 120V96h60l10-18 10 18h40V70l14-26 14 26v26h50l8-14 8 14h30V58l6-10 6-22 6 22 6 10v38h46l12-20 12 20h70V64l18-34 18 34v32h40l10-16 10 16h60V50l10-12 10-26 10 26 10 12v46h50l9-15 9 15h70V72l15-28 15 28v24h40l8-13 8 13h60V60l12-24 12 24v36h50l10-18 10 18H1200V120z"
      />
    </svg>
  );
}

/** Peacock feather accent (Krishna's symbol) used at the footer corner. */
export function PeacockFeather({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 160" className={cn("h-28 w-auto", className)}>
      <path d="M32 158C30 110 31 70 34 30" stroke="currentColor" strokeWidth="2" fill="none" />
      <g stroke="currentColor" strokeWidth="1" opacity=".55">
        {Array.from({ length: 14 }, (_, i) => (
          <path
            key={i}
            d={`M33 ${150 - i * 9}c-10-4-18-10-24-18M33 ${150 - i * 9}c10-4 18-10 24-18`}
            fill="none"
          />
        ))}
      </g>
      <ellipse cx="34" cy="30" rx="16" ry="24" fill="var(--accent-teal)" opacity=".85" />
      <ellipse cx="34" cy="32" rx="10" ry="15" fill="var(--brand-blue)" />
      <ellipse cx="34" cy="34" rx="5" ry="8" fill="var(--brand-navy-deep)" />
    </svg>
  );
}
