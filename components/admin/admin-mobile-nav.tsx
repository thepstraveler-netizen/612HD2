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
      <SheetContent side="left" className="bg-sidebar text-sidebar-foreground">
        <SheetHeader>
          <SheetTitle className="text-white">{t("admin.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("admin.title")}</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-2 pb-6">
          <AdminSidebarNav allowed={allowed} canAudit={canAudit} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
