"use client";

import { CheckCheck, ChevronDown, PhoneCall, RotateCcw, XCircle, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { setLeadStatus } from "@/lib/leads/crm-actions";
import { manualNext } from "@/lib/leads/status";
import { OTHER_REASON, lostReasonOptions, lostReasonText } from "@/lib/leads/ui";
import type { LeadStatus } from "@/schemas/leads";
import { LeadSheet, useLeadAction } from "./lead-shared";

type Move = "contacted" | "won" | "lost";

const ICONS: Record<Move, LucideIcon> = { contacted: PhoneCall, won: CheckCheck, lost: XCircle };

/**
 * The manual moves for a lead (lib/leads/status.ts manualNext). Lost asks
 * for a reason from `leads.defaults` (or the agent's own words). As a
 * compact menu on board cards, or a row of buttons on the lead page.
 */
export function LeadStatusMenu({
  leadId,
  status,
  lostReasons,
  variant = "menu",
}: {
  leadId: string;
  status: LeadStatus;
  lostReasons: string[];
  variant?: "menu" | "buttons";
}) {
  const t = useTranslations("leadsAdmin");
  const { pending, run } = useLeadAction();
  const [lostOpen, setLostOpen] = useState(false);
  const moves = manualNext(status).filter((s): s is Move => s !== "new" && s !== "quoted");
  if (moves.length === 0) return null;

  // Lost → Contacted reads as "Reopen".
  const label = (move: Move) =>
    move === "contacted" && status === "lost" ? t("moves.reopen") : t(`moves.${move}`);
  const icon = (move: Move) => (move === "contacted" && status === "lost" ? RotateCcw : ICONS[move]);

  const pick = (move: Move) => {
    if (move === "lost") {
      setLostOpen(true);
      return;
    }
    if (move === "won" && !window.confirm(t("moves.confirmWon"))) return;
    run(
      setLeadStatus,
      { leadId, status: move },
      { success: t("moves.moved", { status: t(`status.${move}`) }) },
    );
  };

  return (
    <>
      {variant === "menu" ? (
        // Not modal: picking "Lost" opens a sheet, and a modal menu would leave the page locked.
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-11 sm:h-9" disabled={pending}>
              {t("moves.label")} <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("moves.label")}</DropdownMenuLabel>
            {moves.map((move) => {
              const Icon = icon(move);
              return (
                <DropdownMenuItem key={move} className="min-h-11" onSelect={() => pick(move)}>
                  <Icon aria-hidden="true" /> {label(move)}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        // Phones: a two-column grid (an odd last button spans the row); from sm a wrapping row.
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*:last-child:nth-child(odd)]:col-span-2">
          {moves.map((move) => {
            const Icon = icon(move);
            return (
              <Button
                key={move}
                type="button"
                variant={move === "won" ? "default" : move === "lost" ? "outline" : "secondary"}
                className={move === "lost" ? "text-destructive" : undefined}
                disabled={pending}
                onClick={() => pick(move)}
              >
                <Icon /> {label(move)}
              </Button>
            );
          })}
        </div>
      )}

      <LeadSheet
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title={t("lost.title")}
        lead={t("lost.lead")}
      >
        <LostForm
          reasons={lostReasons}
          pending={pending}
          onSubmit={(reason) =>
            run(
              setLeadStatus,
              { leadId, status: "lost", reason },
              { success: t("moves.moved", { status: t("status.lost") }), onDone: () => setLostOpen(false) },
            )
          }
        />
      </LeadSheet>
    </>
  );
}

function LostForm({
  reasons,
  pending,
  onSubmit,
}: {
  reasons: string[];
  pending: boolean;
  onSubmit: (reason: string) => void;
}) {
  const t = useTranslations("leadsAdmin");
  const options = lostReasonOptions(reasons);
  const [choice, setChoice] = useState(options[0] ?? OTHER_REASON);
  const [other, setOther] = useState("");
  const [error, setError] = useState(false);
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const reason = lostReasonText(choice, other);
        if (!reason) {
          setError(true);
          return;
        }
        onSubmit(reason.slice(0, 300));
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="lost-reason">{t("lost.reason")}</Label>
        <NativeSelect id="lost-reason" value={choice} onChange={(e) => setChoice(e.target.value)}>
          {options.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value={OTHER_REASON}>{t("lost.other")}</option>
        </NativeSelect>
      </div>
      {choice === OTHER_REASON ? (
        <div className="grid gap-2">
          <Label htmlFor="lost-other">{t("lost.otherLabel")}</Label>
          <Input
            id="lost-other"
            value={other}
            maxLength={300}
            placeholder={t("lost.otherPlaceholder")}
            aria-invalid={error}
            aria-describedby={error ? "lost-other-error" : undefined}
            onChange={(e) => {
              setOther(e.target.value);
              setError(false);
            }}
          />
          {error ? (
            <p id="lost-other-error" className="text-sm text-destructive">
              {t("errors.reasonRequired")}
            </p>
          ) : null}
        </div>
      ) : null}
      <Button type="submit" variant="destructive" disabled={pending}>
        {t("lost.confirm")}
      </Button>
    </form>
  );
}
