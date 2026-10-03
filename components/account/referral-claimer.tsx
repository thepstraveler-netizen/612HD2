"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { claimPendingReferral } from "@/lib/referrals/actions";

/**
 * Rendered by the account layout only while a `ps_ref` cookie is present:
 * claims the referral once and tells the customer how it went.
 */
export function ReferralClaimer() {
  const t = useTranslations("referrals.claim");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void claimPendingReferral()
      .then((result) => {
        if (result.status === "claimed") toast.success(t("claimed"));
        else if (result.status === "error" && result.error !== "referrals_disabled") {
          toast.info(t(result.error));
        }
      })
      .catch(() => undefined);
  }, [t]);
  return null;
}
