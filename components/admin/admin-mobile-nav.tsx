"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AdminModuleKey } from "@/lib/permissions/constants";
import { LogoMark } from "@/components/shared/logo";
import { AdminSidebarNav } from "./admin-sidebar";

export function AdminMobileNav({ allowed, canAudit }: { allowed: AdminModuleKey[]; canAudit: boolean }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("nav.menu")}>
          <Menu className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="gap-0 bg-sidebar text-sidebar-foreground"
        onOpenAutoFocus={(e) => {
          // Start on the current page's link (scrolled into view) rather than the first one.
          const current = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
            "nav [aria-current='page']",
          );
          if (current) {
            e.preventDefault();
            current.focus({ preventScroll: true });
            current.scrollIntoView({ block: "center" });
          }
        }}
      >
        <SheetHeader className="border-b border-white/10">
          <SheetTitle className="flex items-center gap-2 text-white">
            <LogoMark className="size-8" />
            {t("admin.title")}
          </SheetTitle>
          <SheetDescription className="sr-only">{t("admin.title")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <AdminSidebarNav allowed={allowed} canAudit={canAudit} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
