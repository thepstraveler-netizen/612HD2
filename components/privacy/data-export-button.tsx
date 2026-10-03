"use client";

import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/** Downloads GET /api/account/export as a file; explains a rate limit instead of navigating to an error. */
export function DataExportButton() {
  const t = useTranslations("privacy.export");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/export", { cache: "no-store" });
      if (res.status === 429) {
        const minutes = Math.max(1, Math.ceil(Number(res.headers.get("Retry-After") ?? "60") / 60));
        toast.error(t("rateLimited", { minutes }));
        return;
      }
      if (!res.ok) {
        toast.error(t(res.status === 401 || res.status === 403 ? "signin" : "failed"));
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        "ps-traveler-data.json";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t("done"));
      router.refresh();
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" onClick={download} disabled={busy} className="h-11">
      {busy ? <Loader2 className="animate-spin" /> : <Download />} {busy ? t("preparing") : t("button")}
    </Button>
  );
}
