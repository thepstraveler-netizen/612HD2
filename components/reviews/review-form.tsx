"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Controller, useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { createReviewUpload, submitReview } from "@/lib/reviews/actions";
import { checkPhoto } from "@/lib/reviews/ui";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  REVIEW_BODY_MAX,
  REVIEW_PHOTO_TYPES,
  REVIEW_TITLE_MAX,
  reviewFormSchema,
  type ReviewFormInput,
} from "@/schemas/reviews";

type Photo = {
  key: string;
  preview: string;
  path?: string;
  state: "uploading" | "done" | "error";
  error?: string;
};

/** Tap targets of 44px; arrow keys move between stars (a radio group). */
function StarPicker({
  value,
  onChange,
  invalid,
  labelId,
}: {
  value: number;
  onChange: (n: number) => void;
  invalid: boolean;
  labelId: string;
}) {
  const t = useTranslations("reviews");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const move = (n: number) => {
    const next = Math.min(5, Math.max(1, n));
    onChange(next);
    refs.current[next - 1]?.focus();
  };
  return (
    <div className="flex items-center gap-3">
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-invalid={invalid || undefined}
        className="flex"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            ref={(el) => {
              refs.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t("form.starOption", { count: n })}
            tabIndex={value ? (value === n ? 0 : -1) : n === 1 ? 0 : -1}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                move(n + 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                move(n - 1);
              }
            }}
            className="flex size-11 items-center justify-center rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Star
              className={cn(
                "size-8 transition-colors",
                n <= shown ? "fill-accent-amber text-accent-amber" : "text-muted-foreground/50",
              )}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <span className="text-sm font-medium text-muted-foreground" aria-live="polite">
        {shown ? t(`form.ratingWords.${shown}`) : ""}
      </span>
    </div>
  );
}

export function ReviewForm({
  code,
  noun,
  maxPhotos,
  maxPhotoMb,
  minBodyChars,
}: {
  code: string;
  noun: "stay" | "trip" | "order";
  maxPhotos: number;
  maxPhotoMb: number;
  minBodyChars: number;
}) {
  const t = useTranslations("reviews");
  const locale = useLocale();
  const router = useRouter();
  const ids = { rating: useId(), title: useId(), body: useId(), photos: useId() };
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pending, startTransition] = useTransition();
  const form = useForm<ReviewFormInput>({
    resolver: zodResolver(reviewFormSchema, undefined, { raw: true }),
    defaultValues: {
      code,
      rating: 0,
      title: "",
      body: "",
      photos: [],
      locale: locale === "hi" ? "hi" : "en",
    },
  });
  const errors = form.formState.errors;
  const errorText = (key: string | undefined) =>
    key
      ? t.has(`errors.${key}`)
        ? t(`errors.${key}`, { min: minBodyChars, mb: maxPhotoMb, max: maxPhotos })
        : t("errors.submitFailed")
      : null;
  const body = form.watch("body") ?? "";

  // Free the preview URLs when the form goes away.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const upload = async (file: File, before: number) => {
    const key = crypto.randomUUID();
    const preview = URL.createObjectURL(file);
    previews.current.push(preview);
    const problem = checkPhoto(file, maxPhotoMb);
    setPhotos((list) => [
      ...list,
      { key, preview, state: problem ? "error" : "uploading", error: problem ?? undefined },
    ]);
    if (problem) return;
    const finish = (patch: Partial<Photo>) =>
      setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
    try {
      const ticket = await createReviewUpload({ mime_type: file.type, size_bytes: file.size }, before);
      if (!ticket.ok) return finish({ state: "error", error: ticket.error });
      const { error } = await createClient()
        .storage.from("media")
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (error) {
        console.error(error);
        return finish({ state: "error", error: "uploadFailed" });
      }
      finish({ state: "done", path: ticket.path });
    } catch (e) {
      console.error(e);
      finish({ state: "error", error: "uploadFailed" });
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const before = photos.filter((p) => p.state !== "error").length;
    const chosen = Array.from(files).slice(0, Math.max(0, maxPhotos - before));
    if (files.length > chosen.length) toast.error(t("errors.tooManyPhotos", { max: maxPhotos }));
    chosen.forEach((f, i) => void upload(f, before + i));
  };

  const uploading = photos.some((p) => p.state === "uploading");
  const activePhotos = photos.filter((p) => p.state !== "error").length;

  const onSubmit = form.handleSubmit(
    (values) =>
      startTransition(async () => {
        const result = await submitReview({
          ...values,
          photos: photos.filter((p) => p.state === "done" && p.path).map((p) => p.path as string),
        });
        if (result.ok) {
          toast.success(result.status === "published" ? t("form.thanksPublished") : t("form.thanksPending"));
          router.refresh();
          return;
        }
        if (result.field && result.field in values) {
          form.setError(result.field as Path<ReviewFormInput>, { message: result.error });
        }
        toast.error(errorText(result.error));
      }),
    () => toast.error(t("errors.checkForm")),
  );

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <p id={ids.rating} className="text-sm font-medium">
          {t("form.rating")}
        </p>
        <Controller
          control={form.control}
          name="rating"
          render={({ field }) => (
            <StarPicker
              value={Number(field.value) || 0}
              onChange={(n) => field.onChange(n)}
              invalid={!!errors.rating}
              labelId={ids.rating}
            />
          )}
        />
        {errors.rating ? (
          <p className="text-sm text-destructive">{errorText(errors.rating.message)}</p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={ids.title}>{t("form.title")}</Label>
        <Input
          id={ids.title}
          maxLength={REVIEW_TITLE_MAX}
          placeholder={t(`form.titlePlaceholder.${noun}`)}
          aria-invalid={!!errors.title}
          {...form.register("title")}
        />
        {errors.title ? <p className="text-sm text-destructive">{errorText(errors.title.message)}</p> : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={ids.body}>{t("form.body")}</Label>
        <Textarea
          id={ids.body}
          rows={5}
          maxLength={REVIEW_BODY_MAX}
          placeholder={t(`form.bodyPlaceholder.${noun}`)}
          aria-invalid={!!errors.body}
          aria-describedby={`${ids.body}-hint`}
          {...form.register("body")}
        />
        <p id={`${ids.body}-hint`} className="text-xs text-muted-foreground">
          {minBodyChars > 0
            ? t("form.bodyHintMin", { min: minBodyChars, count: body.trim().length })
            : t("form.bodyHint", { count: body.trim().length, max: REVIEW_BODY_MAX })}
        </p>
        {errors.body ? <p className="text-sm text-destructive">{errorText(errors.body.message)}</p> : null}
      </div>

      {maxPhotos > 0 ? (
        <div className="grid gap-2">
          <p id={ids.photos} className="text-sm font-medium">
            {t("form.photos")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("form.photosHint", { max: maxPhotos, mb: maxPhotoMb })}
          </p>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            accept={REVIEW_PHOTO_TYPES.join(",")}
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <ul className="flex flex-wrap gap-2" aria-labelledby={ids.photos}>
            {photos.map((p, i) => (
              <li key={p.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL) */}
                <img
                  src={p.preview}
                  alt={t("form.photoPreview", { n: i + 1 })}
                  className={cn(
                    "size-20 rounded-lg border object-cover sm:size-24",
                    p.state === "error" && "opacity-40",
                  )}
                />
                {p.state === "uploading" ? (
                  <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                    <Loader2 className="size-5 animate-spin text-white" aria-hidden="true" />
                    <span className="sr-only">{t("form.uploading")}</span>
                  </span>
                ) : null}
                {p.state === "error" ? (
                  <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-destructive px-1 py-0.5 text-center text-[10px] leading-tight text-white">
                    {errorText(p.error)}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPhotos((list) => list.filter((x) => x.key !== p.key))}
                  className="absolute -top-2 -right-2 flex size-11 items-center justify-center"
                  aria-label={t("form.removePhoto", { n: i + 1 })}
                >
                  <span className="flex size-7 items-center justify-center rounded-full border bg-background shadow-sm">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
            {activePhotos < maxPhotos ? (
              <li>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:size-24"
                >
                  <ImagePlus className="size-5" aria-hidden="true" />
                  {t("form.addPhoto")}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("form.publicNote")}</p>
      <Button
        type="submit"
        disabled={pending || uploading}
        className="w-full sm:w-auto sm:justify-self-start"
      >
        {pending ? t("form.sending") : t("form.submit")}
      </Button>
    </form>
  );
}
