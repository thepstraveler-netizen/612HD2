"use client";

import { Ban, Copy, Link2, MessageCircle, UserRoundCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import {
  assignRiderAction,
  moveOrderAction,
  riderLinkAction,
  type DeliveryActionResult,
} from "@/lib/delivery/admin-actions";
import { whatsappShareUrl } from "@/lib/rides/admin-rows";
import type { OrderMove } from "@/schemas/delivery-admin";
import { useDeliveryErrorText } from "./delivery-shared";

type Option = { value: string; label: string };

/**
 * Dispatch actions on one board card: the next status (staff skip the
 * delivery OTP), other allowed moves, reject with a reason (cancels and
 * refunds), assign / reassign a rider, and copy or WhatsApp the rider link.
 * The server re-checks the permission and set_order_status every move.
 */
export function DeliveryOrderActions({
  orderId,
  code,
  canWrite,
  primary,
  others,
  canReject,
  canAssign,
  assigned,
  riders,
  current,
}: {
  orderId: string;
  code: string;
  /** food.write / medicine.write: moves and assignment. Readers only get the rider link. */
  canWrite: boolean;
  primary: OrderMove | null;
  others: OrderMove[];
  canReject: boolean;
  canAssign: boolean;
  assigned: boolean;
  riders: Option[];
  current: { partnerId: string | null; partnerPhone: string | null };
}) {
  const t = useTranslations("deliveryAdmin");
  const errorText = useDeliveryErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [partnerId, setPartnerId] = useState(current.partnerId ?? "");
  const [link, setLink] = useState<string | null>(null);

  const run = (action: () => Promise<DeliveryActionResult>, success: string, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        after?.();
      } else {
        toast.error(errorText(result.error));
      }
      router.refresh();
    });

  const move = (status: OrderMove) => {
    if (!window.confirm(t("actions.confirmMove", { status: t(`status.${status}`) }))) return;
    run(() => moveOrderAction({ orderId, status }), t("actions.moved", { status: t(`status.${status}`) }));
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("actions.linkCopied"));
    } catch {
      // Clipboard blocked: the link stays visible to copy by hand.
    }
  };

  const showLink = () =>
    startTransition(async () => {
      const r = await riderLinkAction({ orderId });
      if ("url" in r) {
        setLink(r.url);
        void copy(r.url);
      } else if (!r.ok) {
        toast.error(errorText(r.error));
      }
    });

  return (
    <div className="flex flex-wrap gap-2">
      {canWrite && primary ? (
        <Button
          type="button"
          size="sm"
          className="h-11 sm:h-9"
          disabled={pending}
          onClick={() => move(primary)}
        >
          {t(`actions.moves.${primary}`)}
        </Button>
      ) : null}
      {canWrite
        ? others.map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              className="h-11 sm:h-9"
              variant="secondary"
              disabled={pending}
              onClick={() => move(s)}
            >
              {t(`actions.moves.${s}`)}
            </Button>
          ))
        : null}
      {canWrite && canReject ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-11 text-destructive sm:h-9"
          disabled={pending}
          onClick={() => setRejectOpen(true)}
        >
          <Ban /> {t("actions.reject")}
        </Button>
      ) : null}
      {canWrite && canAssign ? (
        <Button
          type="button"
          size="sm"
          className="h-11 sm:h-9"
          variant="outline"
          disabled={pending}
          onClick={() => setAssignOpen(true)}
        >
          <UserRoundCheck /> {assigned ? t("actions.reassign") : t("actions.assign")}
        </Button>
      ) : null}
      {assigned ? (
        <Button
          type="button"
          size="sm"
          className="h-11 sm:h-9"
          variant="ghost"
          disabled={pending}
          onClick={showLink}
        >
          <Link2 /> {t("actions.copyLink")}
        </Button>
      ) : null}

      {canWrite ? (
        <Sheet open={assignOpen} onOpenChange={setAssignOpen}>
          <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-4 sm:p-6">
            <SheetHeader className="pr-10">
              <SheetTitle>
                {assigned ? t("actions.reassignTitle", { code }) : t("actions.assignTitle", { code })}
              </SheetTitle>
              <SheetDescription>{t("actions.assignLead")}</SheetDescription>
            </SheetHeader>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!partnerId) return toast.error(t("actions.pickRiderFirst"));
                run(
                  () => assignRiderAction({ orderId, partnerId }),
                  t("actions.assigned"),
                  () => setAssignOpen(false),
                );
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor={`r-${orderId}`}>{t("actions.rider")}</Label>
                <NativeSelect
                  id={`r-${orderId}`}
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                >
                  <option value="">{t("actions.pickRider")}</option>
                  {riders.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </NativeSelect>
                {riders.length === 0 ? (
                  <p className="text-xs text-accent-amber">{t("actions.noRiders")}</p>
                ) : null}
              </div>
              {assigned ? <p className="text-xs text-muted-foreground">{t("actions.reassignHelp")}</p> : null}
              <Button type="submit" disabled={pending}>
                {assigned ? t("actions.reassign") : t("actions.assign")}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      ) : null}

      {canWrite && canReject ? (
        <Sheet open={rejectOpen} onOpenChange={setRejectOpen}>
          <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-4 sm:p-6">
            <SheetHeader className="pr-10">
              <SheetTitle>{t("actions.rejectTitle", { code })}</SheetTitle>
              <SheetDescription>{t("actions.rejectLead")}</SheetDescription>
            </SheetHeader>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim().length < 3) return toast.error(t("actions.reasonRequired"));
                run(
                  () => moveOrderAction({ orderId, status: "rejected", note: reason }),
                  t("actions.rejected"),
                  () => setRejectOpen(false),
                );
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor={`rr-${orderId}`}>{t("actions.reason")}</Label>
                <Textarea
                  id={`rr-${orderId}`}
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("actions.reasonPlaceholder")}
                />
              </div>
              <Button type="submit" variant="destructive" disabled={pending}>
                {t("actions.reject")}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      ) : null}

      {link ? (
        <div className="flex w-full flex-wrap items-center gap-2">
          <Input
            readOnly
            value={link}
            aria-label={t("actions.riderLink")}
            className="h-11 min-w-0 flex-1 font-mono text-base sm:h-9 sm:text-xs"
            onFocus={(e) => e.target.select()}
          />
          <Button
            type="button"
            size="sm"
            className="h-11 sm:h-9"
            variant="outline"
            onClick={() => void copy(link)}
          >
            <Copy /> {t("actions.copy")}
          </Button>
          <Button asChild size="sm" className="h-11 sm:h-9" variant="outline">
            <a
              href={whatsappShareUrl(current.partnerPhone, t("actions.whatsappText", { code, link }))}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle /> {t("actions.whatsapp")}
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
