"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";

/** A secondary page action: a localized page, or a plain link (route handler / download). */
export type HeaderAction = {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Plain <a> (route handlers have no locale prefix); `download` also sets the attribute. */
  plain?: boolean;
  download?: boolean;
};

function ActionLink({ action, className }: { action: HeaderAction; className?: string }) {
  if (action.plain || action.download) {
    return (
      <a href={action.href} download={action.download || undefined} className={className}>
        {action.icon} {action.label}
      </a>
    );
  }
  return (
    <Link href={action.href} className={className}>
      {action.icon} {action.label}
    </Link>
  );
}

/**
 * Secondary actions in a page header. From `sm` up they are outline
 * buttons; on phones two or more collapse into a "More" menu beside the
 * primary button so the header stays one tidy row.
 */
export function HeaderActions({ actions }: { actions: HeaderAction[] }) {
  const t = useTranslations("admin.ui");
  if (actions.length === 0) return null;
  const buttons = actions.map((action) => (
    <Button key={action.href} asChild variant="outline">
      <ActionLink action={action} />
    </Button>
  ));
  if (actions.length === 1) return <>{buttons}</>;
  return (
    <>
      <div className="hidden gap-2 sm:flex">{buttons}</div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="sm:hidden" aria-label={t("moreActions")}>
            <MoreHorizontal className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {actions.map((action) => (
            <DropdownMenuItem key={action.href} asChild className="min-h-11">
              <ActionLink action={action} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
