"use client";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { whatsappShareUrl } from "@/lib/referrals/link";
import { CopyButton } from "./copy-button";

/** The code and invite link with copy and WhatsApp share. */
export function ReferralShare({ code, link }: { code: string; link: string }) {
  const t = useTranslations("referrals");
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("codeLabel")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="rounded-xl border-2 border-dashed border-primary px-4 py-2 font-mono text-2xl font-extrabold tracking-widest">
            {code}
          </p>
          <CopyButton value={code} label={t("copyCode")} />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="referral-link" className="text-sm font-medium">
          {t("linkLabel")}
        </label>
        <input
          id="referral-link"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 w-full rounded-xl border border-input bg-background px-3 font-mono text-sm"
        />
      </div>
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <CopyButton value={link} label={t("copyLink")} variant="default" />
        <Button asChild variant="outline">
          <a href={whatsappShareUrl(t("shareText", { link }))} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" /> {t("whatsapp")}
          </a>
        </Button>
      </div>
    </div>
  );
}
