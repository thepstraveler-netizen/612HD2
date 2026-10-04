import { ArrowLeft, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { HeaderActions, type HeaderAction } from "./header-actions";
import { ScrollRow } from "./scroll-row";

export type { HeaderAction };

/**
 * Title, lead and actions of an admin page. On phones the primary "New"
 * button spans the row with secondary `actions` beside it (two or more fold
 * into a "More" menu); from `sm` up they sit to the right of the title.
 */
export function AdminPageHeader({
  title,
  lead,
  backHref,
  backLabel,
  newHref,
  newLabel,
  actions,
  children,
}: {
  title: string;
  lead?: string;
  backHref?: string;
  backLabel?: string;
  newHref?: string;
  newLabel?: string;
  actions?: HeaderAction[];
  children?: ReactNode;
}) {
  const hasActions = !!newHref || (actions?.length ?? 0) > 0;
  return (
    <div className="space-y-3">
      {backHref ? (
        <Link
          href={backHref}
          className="-my-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[length:var(--text-title)] font-bold break-words">{title}</h1>
          {lead ? <p className="max-w-2xl text-muted-foreground">{lead}</p> : null}
        </div>
        {hasActions ? (
          <div className="flex items-center gap-2 sm:shrink-0">
            {actions ? <HeaderActions actions={actions} /> : null}
            {newHref ? (
              <Button asChild className="order-first flex-1 sm:order-none sm:flex-none">
                <Link href={newHref}>
                  <Plus /> {newLabel}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Secondary navigation between the sub-areas of an admin module: one
 * swipeable row of pills on phones with the current one scrolled into view.
 */
export function AdminSubnav({
  items,
  active,
  label,
}: {
  items: { href: string; label: string; key: string }[];
  active: string;
  label?: string;
}) {
  return (
    <ScrollRow as="nav" label={label} className="-mx-4 sm:mx-0" innerClassName="px-4 pb-1 sm:px-0">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === active ? "page" : undefined}
          className={
            item.key === active
              ? "inline-flex min-h-11 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground md:min-h-10"
              : "inline-flex min-h-11 shrink-0 items-center rounded-full border bg-card px-4 text-sm font-medium hover:bg-accent md:min-h-10"
          }
        >
          {item.label}
        </Link>
      ))}
    </ScrollRow>
  );
}
