"use client";

import { Loader2, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { rateRide } from "@/lib/rides/actions";
import { cn } from "@/lib/utils";

/** Read-only stars for a given rating. */
export function RideStars({ rating, label }: { rating: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-5",
            n <= rating ? "fill-accent-orange text-accent-orange" : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/** 1–5 stars and an optional comment for a completed ride, sent once through `rateRide`. */
export function RideRatingForm({ code }: { code: string }) {
  const t = useTranslations("rides.rating");
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await rateRide({ code, rating, comment });
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
      aria-labelledby="ride-rate-title"
    >
      <fieldset>
        <legend id="ride-rate-title" className="mb-2 text-base font-bold">
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
                name="rating"
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
