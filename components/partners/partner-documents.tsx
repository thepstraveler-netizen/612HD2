"use client";

import { CircleAlert, CircleCheck, FileUp, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createPartnerUpload } from "@/lib/partners/actions";
import { checkFile, fileSizeLabel } from "@/lib/partners/ui";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  PARTNER_DOCUMENT_TYPES,
  type PartnerDocumentKind,
  type PartnerDocumentType,
  type PartnerUploadedDoc,
} from "@/schemas/partners";

export type DocItem = {
  key: string;
  kind: PartnerDocumentKind;
  name: string;
  size: number;
  mime: PartnerDocumentType;
  state: "uploading" | "done" | "error";
  path?: string;
  error?: string;
};

/** Uploaded items in the shape the application expects. */
export function uploadedDocs(items: readonly DocItem[]): PartnerUploadedDoc[] {
  return items.flatMap((d) =>
    d.state === "done" && d.path
      ? [{ kind: d.kind, path: d.path, name: d.name.slice(0, 200), mime_type: d.mime, size: d.size }]
      : [],
  );
}

const MAX_DOCS = 15;

/**
 * Step 3 of Partner With Us: one row per required document, plus any
 * optional ones. Each file goes straight to the private bucket with a
 * one-time signed URL from the server; nothing is recorded until the
 * application is sent.
 */
export function PartnerDocuments({
  required,
  optional,
  maxMb,
  items,
  onChange,
  error,
}: {
  required: readonly PartnerDocumentKind[];
  optional: readonly PartnerDocumentKind[];
  maxMb: number;
  items: DocItem[];
  onChange: (update: (items: DocItem[]) => DocItem[]) => void;
  error: string | null;
}) {
  const t = useTranslations("partner.documents");
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<{ kind: PartnerDocumentKind; key: string } | null>(null);
  const [otherKind, setOtherKind] = useState<PartnerDocumentKind>(optional[0] ?? "other");
  const otherId = useId();

  const errorText = (key: string) =>
    t.has(`errors.${key}`) ? t(`errors.${key}`, { mb: maxMb }) : t("errors.uploadFailed");
  const requiredDone = required.filter((k) => items.some((d) => d.kind === k && d.state === "done")).length;
  // Optional files, plus any required-row files left over from another business type.
  const extras = items.filter((d) => !(d.key.startsWith("req:") && required.includes(d.kind)));

  const pick = (kind: PartnerDocumentKind, key: string) => {
    target.current = { kind, key };
    if (fileRef.current) {
      fileRef.current.value = "";
      fileRef.current.click();
    }
  };

  const upload = async (file: File, kind: PartnerDocumentKind, key: string) => {
    const problem = checkFile(file, maxMb);
    const base: DocItem = {
      key,
      kind,
      name: file.name || kind,
      size: file.size,
      mime: (PARTNER_DOCUMENT_TYPES as readonly string[]).includes(file.type)
        ? (file.type as PartnerDocumentType)
        : "application/pdf",
      state: problem ? "error" : "uploading",
      error: problem ?? undefined,
    };
    onChange((list) => [...list.filter((d) => d.key !== key), base]);
    if (problem) return;
    const finish = (patch: Partial<DocItem>) =>
      onChange((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    try {
      const ticket = await createPartnerUpload({ mime_type: file.type, size_bytes: file.size });
      if (!ticket.ok) return finish({ state: "error", error: ticket.error });
      const { error: uploadError } = await createClient()
        .storage.from("documents")
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (uploadError) {
        console.error(uploadError);
        return finish({ state: "error", error: "uploadFailed" });
      }
      finish({ state: "done", path: ticket.path, error: undefined });
    } catch (e) {
      console.error(e);
      finish({ state: "error", error: "uploadFailed" });
    }
  };

  const onFile = (file: File | undefined) => {
    const dest = target.current;
    target.current = null;
    if (file && dest) void upload(file, dest.kind, dest.key);
  };

  const remove = (key: string) => onChange((list) => list.filter((d) => d.key !== key));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("lead", { mb: maxMb })}</p>
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept={PARTNER_DOCUMENT_TYPES.join(",")}
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {required.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">{t("progress", { done: requiredDone, total: required.length })}</span>
          </div>
          <div
            role="progressbar"
            aria-label={t("progress", { done: requiredDone, total: required.length })}
            aria-valuemin={0}
            aria-valuemax={required.length}
            aria-valuenow={requiredDone}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-accent-green transition-all"
              style={{ width: `${(requiredDone / required.length) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      <ul className="space-y-3">
        {required.map((kind) => {
          const key = `req:${kind}`;
          return (
            <DocRow
              key={key}
              label={t(`kinds.${kind}`)}
              badge={t("required")}
              item={items.find((d) => d.key === key)}
              onPick={() => pick(kind, key)}
              onRemove={() => remove(key)}
              errorText={errorText}
            />
          );
        })}
      </ul>

      {optional.length > 0 ? (
        <fieldset className="space-y-3 rounded-2xl border p-4">
          <legend className="px-1 text-sm font-semibold">{t("otherTitle")}</legend>
          {extras.length > 0 ? (
            <ul className="space-y-3">
              {extras.map((d) => (
                <DocRow
                  key={d.key}
                  label={t(`kinds.${d.kind}`)}
                  badge={t("optional")}
                  item={d}
                  onPick={() => pick(d.kind, d.key)}
                  onRemove={() => remove(d.key)}
                  errorText={errorText}
                />
              ))}
            </ul>
          ) : null}
          {items.length < MAX_DOCS ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor={otherId}>{t("otherKind")}</Label>
                <NativeSelect
                  id={otherId}
                  value={otherKind}
                  onChange={(e) => setOtherKind(e.target.value as PartnerDocumentKind)}
                >
                  {optional.map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => pick(otherKind, `opt:${crypto.randomUUID()}`)}
              >
                <Plus aria-hidden="true" /> {t("addOther")}
              </Button>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}
    </div>
  );
}

function DocRow({
  label,
  badge,
  item,
  onPick,
  onRemove,
  errorText,
}: {
  label: string;
  badge: string;
  item: DocItem | undefined;
  onPick: () => void;
  onRemove: () => void;
  errorText: (key: string) => string;
}) {
  const t = useTranslations("partner.documents");
  const busy = item?.state === "uploading";
  return (
    <li
      className={cn(
        "space-y-3 rounded-2xl border bg-card p-4",
        item?.state === "done" && "border-accent-green/50",
        item?.state === "error" && "border-destructive/50",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{label}</p>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {badge}
        </span>
      </div>
      {item ? (
        <div aria-live="polite" className="flex items-start gap-2 text-sm">
          {item.state === "uploading" ? (
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : item.state === "done" ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent-green" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span className="block truncate">{item.name}</span>
            <span className={cn("block", item.state === "error" ? "text-destructive" : "text-muted-foreground")}>
              {item.state === "uploading"
                ? t("uploading")
                : item.state === "done"
                  ? `${t("uploaded")} · ${fileSizeLabel(item.size)}`
                  : `${t("failed")}: ${errorText(item.error ?? "uploadFailed")}`}
            </span>
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={item ? "outline" : "default"} onClick={onPick} disabled={busy}>
          {item ? <RefreshCw aria-hidden="true" /> : <FileUp aria-hidden="true" />}
          {item ? t("replace") : t("choose")}
          <span className="sr-only">: {label}</span>
        </Button>
        {item && !busy ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onRemove}
            aria-label={t("removeNamed", { name: label })}
          >
            <Trash2 aria-hidden="true" /> {t("remove")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
