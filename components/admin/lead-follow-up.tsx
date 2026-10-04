"use client";

import { AlarmClockOff, CalendarPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setFollowUp } from "@/lib/leads/crm-actions";
import { FOLLOW_UP_PICKS, followUpPickAt } from "@/lib/leads/ui";
import { fromLocalInput } from "./use-save";
import { useLeadAction } from "./lead-shared";

/**
 * Sets the next follow-up: quick picks (in an hour, tomorrow 10 am, in 3
 * days at 10 am — India time), any date and time, or clear it. Each change
 * is logged on the timeline.
 */
export function LeadFollowUp({ leadId, hasFollowUp }: { leadId: string; hasFollowUp: boolean }) {
  const t = useTranslations("leadsAdmin.followUpCard");
  const { pending, run } = useLeadAction();
  const [custom, setCustom] = useState("");

  const set = (at: string | null) =>
    run(
      setFollowUp,
      { leadId, at, note: "" },
      { success: at ? t("saved") : t("cleared"), onDone: () => setCustom("") },
    );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {FOLLOW_UP_PICKS.map((pick) => (
          <Button
            key={pick}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => set(followUpPickAt(pick))}
          >
            {t(`picks.${pick}`)}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const at = fromLocalInput(custom);
          if (!at || Date.parse(at) <= Date.now()) {
            toast.error(t("pastTime"));
            return;
          }
          set(at);
        }}
      >
        <div className="grid min-w-full flex-1 gap-1.5 sm:min-w-0">
          <Label htmlFor="lead-follow-up">{t("custom")}</Label>
          <Input
            id="lead-follow-up"
            type="datetime-local"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          disabled={pending || !custom}
          className="flex-1 sm:flex-none"
        >
          <CalendarPlus /> {t("set")}
        </Button>
      </form>
      {hasFollowUp ? (
        <Button type="button" variant="ghost" className="w-fit" disabled={pending} onClick={() => set(null)}>
          <AlarmClockOff /> {t("clear")}
        </Button>
      ) : null}
    </div>
  );
}
