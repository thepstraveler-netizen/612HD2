"use client";

import { Ban, Eye, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  assignPrescriptionPharmacy,
  markPrescriptionReviewing,
  rejectPrescription,
  withdrawMedicineQuote,
} from "@/lib/delivery/admin-actions";
import type { PrescriptionStatus } from "@/schemas/delivery";
import { useDeliveryAction } from "./delivery-shared";

type Option = { value: string; label: string };

/**
 * Review actions on one prescription: pick it up, assign the partner
 * pharmacy, withdraw the live quote, or reject it with a reason the
 * customer is told. The server re-checks medicine.write.
 */
export function MedicineReviewActions({
  id,
  status,
  storeId,
  pharmacies,
  liveQuoteId,
}: {
  id: string;
  status: PrescriptionStatus;
  storeId: string | null;
  pharmacies: Option[];
  liveQuoteId: string | null;
}) {
  const t = useTranslations("deliveryAdmin.prescriptions");
  const { pending, run } = useDeliveryAction();
  const [pharmacy, setPharmacy] = useState(storeId ?? "");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const closed = status === "ordered" || status === "rejected";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "submitted" ? (
          <Button
            type="button"
            size="sm"
            className="h-11 sm:h-9"
            disabled={pending}
            onClick={() => run(() => markPrescriptionReviewing({ id }), t("pickedUp"))}
          >
            <Eye /> {t("markReviewing")}
          </Button>
        ) : null}
        {liveQuoteId ? (
          <Button
            type="button"
            size="sm"
            className="h-11 sm:h-9"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("confirmWithdraw"))) return;
              run(() => withdrawMedicineQuote({ id: liveQuoteId }), t("withdrawn"));
            }}
          >
            <Undo2 /> {t("withdrawQuote")}
          </Button>
        ) : null}
        {!closed ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-11 text-destructive sm:h-9"
            disabled={pending}
            onClick={() => setRejectOpen(true)}
          >
            <Ban /> {t("reject")}
          </Button>
        ) : null}
      </div>
      {!closed ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => assignPrescriptionPharmacy({ id, store_id: pharmacy }), t("pharmacySaved"));
          }}
        >
          <div className="grid min-w-56 flex-1 gap-1.5">
            <Label htmlFor="rx-pharmacy">{t("pharmacy")}</Label>
            <NativeSelect id="rx-pharmacy" value={pharmacy} onChange={(e) => setPharmacy(e.target.value)}>
              <option value="">{t("noPharmacy")}</option>
              {pharmacies.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-11 sm:h-9"
            variant="secondary"
            disabled={pending || pharmacy === (storeId ?? "")}
          >
            {t("assignPharmacy")}
          </Button>
        </form>
      ) : null}

      <Sheet open={rejectOpen} onOpenChange={setRejectOpen}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-4 sm:p-6">
          <SheetHeader className="pr-10">
            <SheetTitle>{t("rejectTitle")}</SheetTitle>
            <SheetDescription>{t("rejectLead")}</SheetDescription>
          </SheetHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length < 3) return toast.error(t("reasonRequired"));
              run(
                () => rejectPrescription({ id, reason }),
                t("rejected"),
                () => setRejectOpen(false),
              );
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="rx-reason">{t("reason")}</Label>
              <Textarea
                id="rx-reason"
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("reasonPlaceholder")}
              />
            </div>
            <Button type="submit" variant="destructive" disabled={pending}>
              {t("reject")}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
