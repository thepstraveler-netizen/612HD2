"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MutationResult } from "@/lib/admin/mutate";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
const EXT: Record<(typeof TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function readDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve({ width: null, height: null });
    img.src = url;
  });
}

/**
 * Uploads straight from the browser to the public `media` bucket (Storage
 * RLS checks the editor's permission), then registers the file in the
 * `media` table through a server action and returns its id.
 */
export function ImageUploader({
  value,
  previewUrl,
  onChange,
  collection,
  alt,
  register,
}: {
  value: string | null | undefined;
  previewUrl: string | null;
  onChange: (mediaId: string | null, url: string | null) => void;
  collection: string;
  alt: { en: string; hi?: string | null };
  register: (input: unknown) => Promise<MutationResult>;
}) {
  const t = useTranslations("cms.upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (!TYPES.includes(file.type as (typeof TYPES)[number])) return toast.error(t("badType"));
    if (file.size > MAX_BYTES) return toast.error(t("tooBig"));
    setBusy(true);
    try {
      const path = `${collection}/${crypto.randomUUID()}.${EXT[file.type as (typeof TYPES)[number]]}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("media").upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) throw error;
      const dims = await readDimensions(file);
      const result = await register({
        path,
        mime_type: file.type,
        size_bytes: file.size,
        ...dims,
        alt,
        collection,
      });
      if (!result.ok || !result.id) throw new Error(result.ok ? "no id" : result.error);
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      onChange(result.id, data.publicUrl);
    } catch (error) {
      console.error(error);
      toast.error(t("failed"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {previewUrl && value ? (
        <div className="relative h-24 w-40 overflow-hidden rounded-xl border bg-muted">
          <Image src={previewUrl} alt="" fill sizes="10rem" className="object-cover" />
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={TYPES.join(",")}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        {busy ? t("uploading") : value ? t("replace") : t("choose")}
      </Button>
      {value ? (
        <Button type="button" variant="ghost" onClick={() => onChange(null, null)} disabled={busy}>
          <X /> {t("remove")}
        </Button>
      ) : null}
    </div>
  );
}
