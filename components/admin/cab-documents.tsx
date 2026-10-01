"use client";

import { ExternalLink, FileUp, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { createFleetUpload, deleteFleetDocument, saveFleetDocument } from "@/lib/cabs/admin-actions";
import { createClient } from "@/lib/supabase/client";
import { FLEET_DOCUMENT_MAX_BYTES, FLEET_DOCUMENT_TYPES, type FleetDocumentKind } from "@/schemas/cab-admin";
import { CabDeleteButton, useCabErrorText } from "./cab-shared";

export type FleetDocumentRow = {
  id: string;
  kind: FleetDocumentKind;
  expires_on: string | null;
  created_at: string;
  url: string | null;
};

const DRIVER_KINDS: FleetDocumentKind[] = ["licence", "id_proof", "other"];
const VEHICLE_KINDS: FleetDocumentKind[] = ["rc", "insurance", "permit", "puc", "fitness", "other"];

/**
 * Scans of a driver's or vehicle's papers in the private `documents`
 * bucket. The server issues a one-time upload URL, the browser uploads the
 * file straight to Storage, then the server records it. Links shown here
 * are signed and short-lived.
 */
export function FleetDocuments({
  ownerType,
  ownerId,
  documents,
  canWrite,
}: {
  ownerType: "driver" | "vehicle";
  ownerId: string;
  documents: FleetDocumentRow[];
  canWrite: boolean;
}) {
  const t = useTranslations("cabsAdmin.documents");
  const tp = useTranslations("cabsAdmin.expiry.papers");
  const format = useFormatter();
  const errorText = useCabErrorText();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const kinds = ownerType === "driver" ? DRIVER_KINDS : VEHICLE_KINDS;
  const [kind, setKind] = useState<FleetDocumentKind>(kinds[0]);
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const label = (k: FleetDocumentKind) => (tp.has(k) ? tp(k) : t(`kinds.${k}`));
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error(t("pickFile"));
    if (!FLEET_DOCUMENT_TYPES.includes(file.type as (typeof FLEET_DOCUMENT_TYPES)[number])) {
      return toast.error(errorText("badFile"));
    }
    if (file.size > FLEET_DOCUMENT_MAX_BYTES) return toast.error(t("tooBig"));
    setBusy(true);
    try {
      const ticket = await createFleetUpload({
        owner_type: ownerType,
        owner_id: ownerId,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (!ticket.ok) return toast.error(errorText(ticket.error));
      const { error } = await createClient()
        .storage.from("documents")
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (error) {
        console.error(error);
        return toast.error(errorText("uploadFailed"));
      }
      const saved = await saveFleetDocument({
        owner_type: ownerType,
        owner_id: ownerId,
        kind,
        file_path: ticket.path,
        expires_on: expires,
      });
      if (!saved.ok) return toast.error(errorText(saved.error));
      toast.success(t("uploaded"));
      setExpires("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid max-w-3xl gap-4 rounded-2xl border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                <span className="font-medium">{label(d.kind)}</span>
                <span className="block text-muted-foreground">
                  {d.expires_on ? t("validUntil", { date: day(d.expires_on) }) : t("noExpiry")} ·{" "}
                  {t("added", { date: day(d.created_at) })}
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                {d.url ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={d.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> {t("open")}
                    </a>
                  </Button>
                ) : null}
                {canWrite ? (
                  <CabDeleteButton id={d.id} action={deleteFleetDocument} confirmText={t("confirmDelete")} />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`doc-kind-${ownerId}`}>{t("kind")}</Label>
            <NativeSelect
              id={`doc-kind-${ownerId}`}
              value={kind}
              onChange={(e) => setKind(e.target.value as FleetDocumentKind)}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`doc-exp-${ownerId}`}>{t("expiresOn")}</Label>
            <Input
              id={`doc-exp-${ownerId}`}
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`doc-file-${ownerId}`}>{t("file")}</Label>
            <Input
              id={`doc-file-${ownerId}`}
              ref={fileRef}
              type="file"
              accept={FLEET_DOCUMENT_TYPES.join(",")}
              className="pt-2"
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t("uploadHelp")}</p>
          <Button type="button" onClick={() => void upload()} disabled={busy} className="sm:justify-self-end">
            {busy ? <Loader2 className="animate-spin" /> : <FileUp />} {busy ? t("uploading") : t("upload")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
