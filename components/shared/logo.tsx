import { cn } from "@/lib/utils";

/** P&S circle mark: navy ring with an italic monogram, drawn as SVG (no raster asset). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn("size-10 shrink-0", className)}>
      <circle cx="24" cy="24" r="22" fill="var(--brand-navy)" />
      <circle cx="24" cy="24" r="18.5" fill="none" stroke="#fff" strokeWidth="1.5" />
      <path
        d="M9 31c8-2 22-10 30-20"
        fill="none"
        stroke="#fff"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity=".7"
      />
      <text
        x="24"
        y="29"
        textAnchor="middle"
        fontFamily="var(--font-script), cursive"
        fontSize="17"
        fontWeight="700"
        fill="#fff"
      >
        P&amp;S
      </text>
    </svg>
  );
}

export function Logo({
  name,
  strapline,
  className,
}: {
  name: string;
  strapline?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex flex-col leading-tight">
        <span className="font-script text-lg font-bold text-heading sm:text-xl">{name}</span>
        {strapline ? (
          <span className="hidden text-[11px] font-medium text-muted-foreground sm:block xl:hidden 2xl:block">
            {strapline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
