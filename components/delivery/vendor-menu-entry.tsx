"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { updateMenuEntry } from "@/lib/delivery/vendor-actions";
import { paiseToRupeesInput, rupeesToPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = {
  kind: "item" | "variant" | "addon";
  id: string;
  name: string;
  available: boolean;
  pricePaise: number;
  /** Omitted for add-ons (no stock). Null = not tracked. */
  stock?: number | null;
  className?: string;
};

/**
 * One menu line (item, variant or add-on): the in-stock switch saves at
 * once; price and stock are edited and saved with the button.
 */
export function VendorMenuEntry({ kind, id, name, available, pricePaise, stock, className }: Props) {
  const t = useTranslations("vendorOrders.menu");
  const te = useTranslations("vendorOrders.errors");
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(available);
  const [price, setPrice] = useState(paiseToRupeesInput(pricePaise));
  const [count, setCount] = useState(stock === null || stock === undefined ? "" : String(stock));
  const [error, setError] = useState<string | null>(null);
  const hasStock = stock !== undefined;

  const toggle = (next: boolean) =>
    start(async () => {
      setOn(next);
      const result = await updateMenuEntry({ kind, id, isAvailable: next });
      if (!result.ok) {
        setOn(!next);
        toast.error(te(result.error));
        return;
      }
      toast.success(next ? t("nowAvailable", { name }) : t("nowSoldOut", { name }));
      router.refresh();
    });

  const save = () => {
    const paise = rupeesToPaise(price);
    const minPrice = kind === "addon" ? 0 : 1;
    if (paise === null || paise < minPrice) {
      setError(t("badPrice"));
      return;
    }
    const trimmed = count.trim();
    if (hasStock && trimmed !== "" && !/^\d{1,6}$/.test(trimmed)) {
      setError(t("badStock"));
      return;
    }
    const nextStock = hasStock ? (trimmed === "" ? null : Number(trimmed)) : undefined;
    start(async () => {
      setError(null);
      const result = await updateMenuEntry(
        kind === "addon"
          ? { kind, id, pricePaise: paise }
          : { kind, id, pricePaise: paise, ...(hasStock ? { stock: nextStock } : {}) },
      );
      if (!result.ok) {
        setError(te(result.error));
        return;
      }
      toast.success(t("saved", { name }));
      router.refresh();
    });
  };

  const dirty =
    rupeesToPaise(price) !== pricePaise ||
    (hasStock && (count.trim() === "" ? null : Number(count.trim())) !== (stock ?? null));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label
          htmlFor={`${uid}-on`}
          className={cn("min-w-0 font-medium break-words", !on && "text-muted-foreground line-through")}
        >
          {name}
        </label>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {on ? t("available") : t("soldOut")}
          <Switch id={`${uid}-on`} checked={on} disabled={pending} onCheckedChange={toggle} />
        </span>
      </div>
      {/* Phones: price, stock and save side by side in one tidy row. */}
      <div
        className={cn(
          "grid items-end gap-2 sm:flex sm:flex-wrap",
          hasStock ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-[1fr_auto]",
        )}
      >
        <div className="min-w-0 space-y-1 sm:w-28">
          <label htmlFor={`${uid}-price`} className="block text-xs text-muted-foreground">
            {t("price")}
          </label>
          <Input
            id={`${uid}-price`}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-11 sm:h-10"
          />
        </div>
        {hasStock ? (
          <div className="min-w-0 space-y-1 sm:w-28">
            <label htmlFor={`${uid}-stock`} className="block text-xs text-muted-foreground">
              {t("stock")}
            </label>
            <Input
              id={`${uid}-stock`}
              inputMode="numeric"
              value={count}
              placeholder={t("untracked")}
              onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-11 px-2.5 placeholder:text-[0.8125rem] sm:h-10 sm:px-3.5"
            />
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-10"
          disabled={pending || !dirty}
          onClick={save}
        >
          {pending ? <Loader2 className="animate-spin" /> : null} {t("save")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
