import { ArrowLeft, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export function AdminPageHeader({
  title,
  lead,
  backHref,
  backLabel,
  newHref,
  newLabel,
  children,
}: {
  title: string;
  lead?: string;
  backHref?: string;
  backLabel?: string;
  newHref?: string;
  newLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[length:var(--text-title)] font-bold">{title}</h1>
          {lead ? <p className="max-w-2xl text-muted-foreground">{lead}</p> : null}
        </div>
        {newHref ? (
          <Button asChild>
            <Link href={newHref}>
              <Plus /> {newLabel}
            </Link>
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Secondary navigation between the sub-areas of an admin module. */
export function AdminSubnav({
  items,
  active,
}: {
  items: { href: string; label: string; key: string }[];
  active: string;
}) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === active ? "page" : undefined}
          className={
            item.key === active
              ? "inline-flex min-h-10 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
              : "inline-flex min-h-10 shrink-0 items-center rounded-full border bg-card px-4 text-sm font-medium hover:bg-accent"
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
