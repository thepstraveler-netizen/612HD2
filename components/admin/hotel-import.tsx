"use client";

import { FileUp, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { HotelImportIssue } from "@/lib/hotels/csv-import";
import { MAX_IMPORT_BYTES } from "@/lib/hotels/csv-import";
import {
  applyHotelImport,
  previewHotelImport,
  type HotelImportPreview,
  type HotelImportResult,
} from "@/lib/hotels/import-actions";

/** Admin → Hotels → Import CSV: pick a file, check it, then apply it (D-106). */
export function HotelImport() {
  const t = useTranslations("hotelsAdmin.import");
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Extract<HotelImportPreview, { ok: true }> | null>(null);
  const [issues, setIssues] = useState<HotelImportIssue[]>([]);
  const [result, setResult] = useState<Extract<HotelImportResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();

  const errorText = (code: string) =>
    t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.saveFailed");
  const issueText = (issue: HotelImportIssue) => {
    const [code, value] = issue.message.split(":");
    const message = t.has(`errors.${code}`) ? t(`errors.${code}`, { value: value ?? "" }) : issue.message;
    if (issue.line === 0) return message;
    return issue.column
      ? t("issueAt", { line: issue.line, column: issue.column, message })
      : t("issueLine", { line: issue.line, message });
  };

  const onFile = async (file: File | undefined) => {
    setPreview(null);
    setIssues([]);
    setResult(null);
    setCsv(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error(errorText("fileTooLarge"));
      return;
    }
    const text = await file.text();
    setCsv(text);
    start(async () => {
      const res = await previewHotelImport(text);
      if (res.ok) setPreview(res);
      else {
        setIssues(res.issues ?? []);
        toast.error(errorText(res.error));
      }
    });
  };

  const onApply = () => {
    if (!csv) return;
    start(async () => {
      const res = await applyHotelImport(csv);
      if (res.ok) {
        setResult(res);
        setPreview(null);
        setCsv(null);
        toast.success(t("done"));
        router.refresh();
        return;
      }
      setIssues(res.issues ?? []);
      setPreview(null);
      toast.error(errorText(res.error));
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Label htmlFor="hotel-csv">{t("file")}</Label>
          <Input
            id="hotel-csv"
            type="file"
            accept=".csv,text/csv"
            disabled={pending}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <p className="text-sm text-muted-foreground">{t("help")}</p>
        </CardContent>
      </Card>

      {issues.length ? (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-semibold text-destructive">{t("issuesTitle", { count: issues.length })}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {issues.slice(0, 50).map((issue, i) => (
              <li key={i}>{issueText(issue)}</li>
            ))}
          </ul>
          {issues.length > 50 ? (
            <p className="text-sm text-muted-foreground">{t("moreIssues", { count: issues.length - 50 })}</p>
          ) : null}
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="font-semibold">{t("previewTitle")}</p>
          <ul className="space-y-1 text-sm">
            <li>{t("previewRows", { count: preview.rows, plans: preview.plans })}</li>
            <li>
              {t("previewNew", { count: preview.newHotels.length, list: preview.newHotels.join(", ") })}
            </li>
            <li>
              {t("previewExisting", {
                count: preview.existingHotels.length,
                list: preview.existingHotels.join(", "),
              })}
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">{t("previewNote")}</p>
          <Button type="button" onClick={onApply} disabled={pending}>
            <Upload /> {t("apply")}
          </Button>
        </div>
      ) : null}

      {result ? (
        <div role="status" className="space-y-1 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <FileUp className="size-4" aria-hidden="true" /> {t("done")}
          </p>
          <p>{t("resultHotels", { created: result.hotelsCreated, updated: result.hotelsUpdated })}</p>
          <p>{t("resultRooms", { created: result.roomsCreated, updated: result.roomsUpdated })}</p>
          <p>{t("resultPlans", { created: result.plansCreated, updated: result.plansUpdated })}</p>
        </div>
      ) : null}
    </div>
  );
}
