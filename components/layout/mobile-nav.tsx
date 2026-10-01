"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import { MAIN_NAV } from "@/lib/navigation";

export function MobileNav() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="xl:hidden" aria-label={t("nav.menu")}>
          <Menu className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>
            <Logo name={t("brand.short")} />
          </SheetTitle>
          <SheetDescription className="sr-only">{t("nav.main")}</SheetDescription>
        </SheetHeader>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-1 overflow-y-auto px-2 pb-6">
          {MAIN_NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-xl px-3 font-medium hover:bg-accent"
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
