"use client";

import { ChevronDown, Mail, MessageCircle, Phone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { assignLead, logLeadActivity, quickReply } from "@/lib/leads/crm-actions";
import { whatsappLink } from "@/lib/leads/status";
import type { QuickReply } from "@/schemas/leads";
import { useLeadAction, useLeadsErrorText } from "./lead-shared";

type Option = { value: string; label: string };

/** Message keys for the quick-reply templates (template keys contain dots, message keys cannot). */
const REPLY_LABEL: Record<QuickReply, string> = {
  "crm.intro": "intro",
  "crm.follow_up": "followUp",
  "quote.sent": "quoteSent",
};

/** Who works the lead. Changing it notifies the new assignee (server side). */
export function LeadAssignee({
  leadId,
  assignedTo,
  assigneeName,
  staff,
  canWrite,
}: {
  leadId: string;
  assignedTo: string | null;
  assigneeName: string | null;
  staff: Option[];
  canWrite: boolean;
}) {
  const t = useTranslations("leadsAdmin.detail");
  const { pending, run } = useLeadAction();
  // Someone who has since lost leads.write still shows as the current assignee.
  const options =
    assignedTo && !staff.some((s) => s.value === assignedTo)
      ? [...staff, { value: assignedTo, label: assigneeName ?? "–" }]
      : staff;
  if (!canWrite) {
    return (
      <p className="text-sm">
        <span className="text-muted-foreground">{t("assignee")}: </span>
        {assigneeName ?? t("unassigned")}
      </p>
    );
  }
  return (
    <div className="grid gap-1.5 sm:max-w-64">
      <Label htmlFor="lead-assignee">{t("assignee")}</Label>
      <NativeSelect
        id="lead-assignee"
        value={assignedTo ?? ""}
        disabled={pending}
        onChange={(e) =>
          run(assignLead, { leadId, assignee: e.target.value || null }, { success: t("assigned") })
        }
      >
        <option value="">{t("unassigned")}</option>
        {options.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/**
 * Call, WhatsApp and email the customer. A quick reply is filled in on the
 * server (lead name, reference, live quote link) and opened in WhatsApp in a
 * new tab; afterwards the agent can log it on the timeline in one tap.
 */
export function LeadContact({
  leadId,
  phone,
  email,
  hasSentQuote,
  canWrite,
}: {
  leadId: string;
  phone: string;
  email: string | null;
  /** The "quote sent" reply only makes sense while a quote is out. */
  hasSentQuote: boolean;
  canWrite: boolean;
}) {
  const t = useTranslations("leadsAdmin.contact");
  const errorText = useLeadsErrorText();
  const { pending: logging, run } = useLeadAction();
  const [loading, startTransition] = useTransition();
  const [opened, setOpened] = useState<{
    key: QuickReply;
    text: string;
    whatsappUrl: string;
    mailto: string | null;
    blocked: boolean;
  } | null>(null);
  const replies: QuickReply[] = hasSentQuote
    ? ["crm.intro", "crm.follow_up", "quote.sent"]
    : ["crm.intro", "crm.follow_up"];

  const openReply = (key: QuickReply) => {
    // Open the tab inside the tap so pop-up blockers allow it; point it at WhatsApp once the text is ready.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    startTransition(async () => {
      const result = await quickReply({ leadId, key });
      if (!result.ok) {
        tab?.close();
        toast.error(errorText(result.error));
        return;
      }
      if (tab) tab.location.href = result.whatsappUrl;
      setOpened({
        key,
        text: result.text,
        whatsappUrl: result.whatsappUrl,
        mailto: result.mailto,
        blocked: !tab,
      });
    });
  };

  const log = (kind: "whatsapp" | "email") =>
    opened &&
    run(
      logLeadActivity,
      { leadId, kind, body: opened.text.slice(0, 4000) },
      { success: t("logged"), onDone: () => setOpened(null) },
    );

  return (
    <div className="space-y-3">
      {/* Phones: three equal tiles with the icon above the label. */}
      <div className="grid auto-cols-fr grid-flow-col gap-2 sm:flex sm:flex-wrap">
        <Button
          asChild
          variant="secondary"
          className="h-auto min-h-14 flex-col gap-1 px-2 py-2 text-xs sm:h-11 sm:min-h-0 sm:flex-row sm:gap-2 sm:px-5 sm:py-0 sm:text-sm"
        >
          <a href={`tel:${phone}`}>
            <Phone /> {t("call")}
          </a>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              className="h-auto min-h-14 flex-col gap-1 px-2 py-2 text-xs sm:h-11 sm:min-h-0 sm:flex-row sm:gap-2 sm:px-5 sm:py-0 sm:text-sm"
            >
              <MessageCircle /> {t("whatsapp")} <ChevronDown aria-hidden="true" className="hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t("quickReplies")}</DropdownMenuLabel>
            {replies.map((key) => (
              <DropdownMenuItem key={key} className="min-h-11" onSelect={() => openReply(key)}>
                {t(`replies.${REPLY_LABEL[key]}`)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="min-h-11">
              <a href={whatsappLink(phone, "")} target="_blank" rel="noopener noreferrer">
                {t("blankChat")}
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {email ? (
          <Button
            asChild
            variant="secondary"
            className="h-auto min-h-14 flex-col gap-1 px-2 py-2 text-xs sm:h-11 sm:min-h-0 sm:flex-row sm:gap-2 sm:px-5 sm:py-0 sm:text-sm"
          >
            <a href={`mailto:${email}`}>
              <Mail /> {t("email")}
            </a>
          </Button>
        ) : null}
      </div>

      {opened ? (
        <div className="grid gap-3 rounded-xl border bg-muted/40 p-3 text-sm" role="status">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">
              {opened.blocked
                ? t("openPrompt")
                : t("opened", { reply: t(`replies.${REPLY_LABEL[opened.key]}`) })}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mt-2 -mr-2"
              aria-label={t("dismiss")}
              onClick={() => setOpened(null)}
            >
              <X />
            </Button>
          </div>
          <p className="line-clamp-4 whitespace-pre-line text-muted-foreground">{opened.text}</p>
          <div className="flex flex-wrap gap-2">
            {opened.blocked ? (
              <Button asChild>
                <a href={opened.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle /> {t("openWhatsapp")}
                </a>
              </Button>
            ) : null}
            {opened.mailto ? (
              <Button asChild variant="outline">
                <a href={opened.mailto}>
                  <Mail /> {t("sendEmail")}
                </a>
              </Button>
            ) : null}
            {canWrite ? (
              <>
                <Button type="button" variant="outline" disabled={logging} onClick={() => log("whatsapp")}>
                  {t("logWhatsapp")}
                </Button>
                {opened.mailto ? (
                  <Button type="button" variant="outline" disabled={logging} onClick={() => log("email")}>
                    {t("logEmail")}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
