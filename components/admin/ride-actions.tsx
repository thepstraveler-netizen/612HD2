"use client";

import { Copy, Link2, MessageCircle, UserRoundCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRouter } from "@/i18n/navigation";
import {
  assignRideAction,
  rideDriverLinkAction,
  setRideStatusAction,
  type RideActionResult,
} from "@/lib/rides/admin-actions";
import { whatsappShareUrl, type RideVehicleChoice } from "@/lib/rides/admin-rows";
import type { RideStep } from "@/schemas/ride-admin";
import { useRideErrorText } from "./ride-shared";

/**
 * Dispatch actions for one ride: assign / reassign a driver with an
 * optional ride vehicle, move it to an allowed next status (staff skip the
 * pickup OTP), and show, copy or WhatsApp the driver's ride link. The server
 * re-checks the permission and the SQL functions re-check every transition.
 */
export function RideActions({
  rideId,
  code,
  canWrite,
  canAssign,
  assigned,
  steps,
  drivers,
  vehicles,
  current,
}: {
  rideId: string;
  code: string;
  /** rides.write: assign and status steps. Readers only get the driver link. */
  canWrite: boolean;
  canAssign: boolean;
  /** A driver is assigned, so the link exists and "Reassign" is shown. */
  assigned: boolean;
  steps: RideStep[];
  drivers: { value: string; label: string }[];
  vehicles: RideVehicleChoice[];
  current: { driverId: string | null; vehicleId: string | null; driverPhone: string | null };
}) {
  const t = useTranslations("admin.rides");
  const errorText = useRideErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [driverId, setDriverId] = useState(current.driverId ?? "");
  const [vehicleId, setVehicleId] = useState(current.vehicleId ?? "");

  const run = (
    action: () => Promise<RideActionResult>,
    success: string,
    after?: (r: RideActionResult) => void,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (success) toast.success(success);
        after?.(result);
      } else {
        toast.error(errorText(result.error));
      }
      router.refresh();
    });

  const pickVehicle = (id: string) => {
    setVehicleId(id);
    // The vehicle's usual driver is suggested when no driver is chosen yet.
    const usual = vehicles.find((v) => v.id === id)?.defaultDriverId;
    if (!driverId && usual && drivers.some((d) => d.value === usual)) setDriverId(usual);
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("actions.linkCopied"));
    } catch {
      // Clipboard blocked: the link stays visible to copy by hand.
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canWrite && canAssign ? (
        <Button
          type="button"
          size="sm"
          className="h-11 sm:h-9"
          variant={assigned ? "outline" : "default"}
          disabled={pending}
          onClick={() => setAssignOpen(true)}
        >
          <UserRoundCheck /> {assigned ? t("actions.reassign") : t("actions.assign")}
        </Button>
      ) : null}
      {canWrite
        ? steps.map((step) => (
            <Button
              key={step}
              type="button"
              size="sm"
              variant={step === "no_show" ? "outline" : "secondary"}
              className={step === "no_show" ? "h-11 text-destructive sm:h-9" : "h-11 sm:h-9"}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t("actions.confirmStep", { status: t(`status.${step}`) }))) return;
                run(
                  () => setRideStatusAction({ rideId, status: step }),
                  t("actions.stepDone", { status: t(`status.${step}`) }),
                );
              }}
            >
              {t(`actions.steps.${step}`)}
            </Button>
          ))
        : null}
      {assigned ? (
        <Button
          type="button"
          size="sm"
          className="h-11 sm:h-9"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await rideDriverLinkAction({ rideId });
              if ("url" in r) setLink(r.url);
              else if (!r.ok) toast.error(errorText(r.error));
            })
          }
        >
          <Link2 /> {t("actions.showLink")}
        </Button>
      ) : null}

      {canWrite ? (
        <Sheet open={assignOpen} onOpenChange={setAssignOpen}>
          <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-4 sm:p-6">
            <SheetHeader className="pr-10">
              <SheetTitle>{assigned ? t("actions.reassignTitle") : t("actions.assignTitle")}</SheetTitle>
              <SheetDescription>{t("actions.assignLead")}</SheetDescription>
            </SheetHeader>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!driverId) return toast.error(t("actions.pickDriverFirst"));
                run(
                  () => assignRideAction({ rideId, driverId, vehicleId }),
                  t("actions.assignedToast"),
                  (r) => {
                    if (r.ok) setAssignOpen(false);
                  },
                );
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor={`d-${rideId}`}>{t("actions.driver")}</Label>
                <NativeSelect
                  id={`d-${rideId}`}
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                >
                  <option value="">{t("actions.pickDriver")}</option>
                  {drivers.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </NativeSelect>
                {drivers.length === 0 ? (
                  <p className="text-xs text-accent-amber">{t("actions.noDrivers")}</p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`v-${rideId}`}>{t("actions.vehicle")}</Label>
                <NativeSelect
                  id={`v-${rideId}`}
                  value={vehicleId}
                  onChange={(e) => pickVehicle(e.target.value)}
                >
                  <option value="">{t("actions.noVehicle")}</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.otherType ? `${v.label} — ${t("actions.otherType")}` : v.label}
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">{t("actions.vehicleHelp")}</p>
              </div>
              {assigned ? <p className="text-xs text-muted-foreground">{t("actions.reassignHelp")}</p> : null}
              <Button type="submit" disabled={pending}>
                {assigned ? t("actions.reassign") : t("actions.assign")}
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
            aria-label={t("actions.driverLink")}
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
              href={whatsappShareUrl(current.driverPhone, t("actions.whatsappText", { code, link }))}
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
