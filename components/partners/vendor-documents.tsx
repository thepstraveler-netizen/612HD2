"use client";

import { ExternalLink, FileUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { checkFile, formatDay } from "@/lib/partners/ui";
import { createVendorUpload, saveVendorDocument } from "@/lib/partners/vendor-actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PARTNER_DOCUMENT_KINDS, PARTNER_DOCUMENT_TYPES, type PartnerDocumentKind } from "@/schemas/partners";

export type VendorDocumentView = {
  id: string;
  kind: string;
  fileName: string;
  status: "pending" | "verified" | "rejected";
  note: string | null;
  expiresOn: string | null;
  createdAt: string;
  url: string | null;
};

/**
 * The vendor's documents and an uploader. The server issues a one-time
 * upload URL under vendors/<vendor id>/, the browser uploads straight to
 * the private bucket, then the server records it (pending until staff
 * verify it). Links are signed and expire after a few minutes.
 */
export function VendorDocuments({
  vendorId,
  documents,
  maxMb,
  locale,
  today,
}: {
  vendorId: string;
  documents: VendorDocumentView[];
  maxMb: number;
  locale: string;
  today: string;
}) {
  const t = useTranslations("vendorBusiness");
  const tk = useTranslations("partner.documents.kinds");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<PartnerDocumentKind>("id_proof");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const label = (k: string) => (tk.has(k) ? tk(k) : tk("other"));
  const errorText = (key: string) => (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.uploadFailed"));

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error(t("documents.pickFile"));
    const problem = checkFile(file, maxMb);
    if (problem) return toast.error(errorText(problem));
    setBusy(true);
    try {
      const ticket = await createVendorUpload({
        vendorId,
        kind,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (!ticket.ok || !ticket.path || !ticket.token) {
        return toast.error(errorText(ticket.ok ? "uploadFailed" : ticket.error));
      }
      const { error } = await createClient()
        .storage.from("documents")
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (error) {
        console.error(error);
        return toast.error(errorText("uploadFailed"));
      }
      const saved = await saveVendorDocument({
        vendorId,
        kind,
        path: ticket.path,
        name: (file.name || kind).slice(0, 200),
        mime_type: file.type,
        size: file.size,
        expiresOn: expires,
      });
      if (!saved.ok) return toast.error(errorText(saved.error));
      toast.success(t("documents.uploaded"));
      setExpires("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      console.error(e);
      toast.error(errorText("uploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="vendor-docs" className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h2 id="vendor-docs" className="text-lg font-semibold">
          {t("documents.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("documents.lead")}</p>
      </div>

      {documents.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t("documents.empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {documents.map((d) => {
            const expired = d.expiresOn !== null && d.expiresOn < today;
            return (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {label(d.kind)}{" "}
                    <span
                      className={cn(
                        "ml-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        d.status === "verified" && "bg-accent-green/15 text-accent-green",
                        d.status === "pending" && "bg-accent-orange/15 text-accent-orange",
                        d.status === "rejected" && "bg-destructive/10 text-destructive",
                      )}
                    >
                      {t(`documents.statuses.${d.status}`)}
                    </span>
                  </p>
                  <p className="truncate text-muted-foreground">{d.fileName}</p>
                  <p className={cn("text-muted-foreground", expired && "font-medium text-destructive")}>
                    {d.expiresOn
                      ? expired
                        ? t("documents.expired", { date: formatDay(d.expiresOn, locale) })
                        : t("documents.expires", { date: formatDay(d.expiresOn, locale) })
                      : t("documents.noExpiry")}{" "}
                    · {t("documents.added", { date: formatDay(d.createdAt, locale) })}
                  </p>
                  {d.note ? <p className="text-sm">{t("documents.note", { note: d.note })}</p> : null}
                </div>
                {d.url ? (
                  <Button asChild variant="outline">
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("documents.openNamed", { name: label(d.kind) })}
                    >
                      <ExternalLink aria-hidden="true" /> {t("documents.open")}
                    </a>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <fieldset className="grid gap-3 rounded-xl border p-3 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">{t("documents.add")}</legend>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-kind`}>{t("documents.kind")}</Label>
          <NativeSelect
            id={`${id}-kind`}
            value={kind}
            onChange={(e) => setKind(e.target.value as PartnerDocumentKind)}
          >
            {PARTNER_DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-exp`}>{t("documents.expiresOn")}</Label>
          <Input id={`${id}-exp`} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-file`}>{t("documents.file")}</Label>
          <Input
            id={`${id}-file`}
            ref={fileRef}
            type="file"
            accept={PARTNER_DOCUMENT_TYPES.join(",")}
            className="pt-2"
          />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">{t("documents.help", { mb: maxMb })}</p>
        <Button type="button" onClick={() => void upload()} disabled={busy} className="sm:justify-self-end">
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileUp aria-hidden="true" />}
          {busy ? t("documents.uploading") : t("documents.upload")}
        </Button>
      </fieldset>
    </section>
  );
}
