"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { setStoreAccepting } from "@/lib/delivery/vendor-actions";

/** Pause or resume new orders for one store. */
export function VendorStoreToggle({ storeId, accepting }: { storeId: string; accepting: boolean }) {
  const t = useTranslations("vendorOrders.store");
  const te = useTranslations("vendorOrders.errors");
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(accepting);
  const [pending, start] = useTransition();

  const change = (next: boolean) =>
    start(async () => {
      setValue(next);
      const result = await setStoreAccepting({ storeId, accepting: next });
      if (!result.ok) {
        setValue(!next);
        toast.error(te(result.error));
        return;
      }
      toast.success(next ? t("resumed") : t("paused"));
      router.refresh();
    });

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
      <label htmlFor={id} className="text-sm font-medium">
        {value ? t("accepting") : t("notAccepting")}
        <span className="block text-xs font-normal text-muted-foreground">{t("toggleHelp")}</span>
      </label>
      <Switch id={id} checked={value} disabled={pending} onCheckedChange={change} />
    </div>
  );
}
