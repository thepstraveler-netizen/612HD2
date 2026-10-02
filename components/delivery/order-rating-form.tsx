"use client";

import { Loader2, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { rateOrder } from "@/lib/delivery/actions";
import { cn } from "@/lib/utils";

/** 1–5 stars and an optional comment for a delivered order, sent once through `rateOrder`. */
export function OrderRatingForm({ code }: { code: string }) {
  const t = useTranslations("orderTrip.rating");
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await rateOrder({ code, rating, comment: comment.trim() || undefined });
      if (!result.ok) {
        setError(t(`errors.${result.error}`));
        if (result.error === "already_rated") router.refresh();
        return;
      }
      toast.success(t("thanks"));
      router.refresh();
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (rating) submit();
      }}
      className="space-y-3"
      aria-labelledby="order-rate-title"
    >
      <fieldset>
        <legend id="order-rate-title" className="mb-2 text-base font-bold">
          {t("title")}
        </legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="grid size-11 cursor-pointer place-items-center rounded-full has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="order-rating"
                value={n}
                className="sr-only"
                checked={rating === n}
                onChange={() => setRating(n)}
                aria-label={t("starLabel", { count: n })}
              />
              <Star
                className={cn(
                  "size-8 transition",
                  n <= rating ? "fill-accent-orange text-accent-orange" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">{t("comment")}</span>
        <Textarea rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!rating || pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} {t("submit")}
      </Button>
    </form>
  );
}
