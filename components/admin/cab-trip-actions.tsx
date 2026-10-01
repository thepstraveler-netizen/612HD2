"use client";

import { Copy, Link2, UserRoundCheck } from "lucide-react";
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
  assignTripAction,
  driverLinkAction,
  setTripStatusAction,
  type TripActionResult,
} from "@/lib/cabs/admin-actions";
import type { VehicleChoice } from "@/lib/cabs/admin-rows";
import type { TripStep } from "@/schemas/cab-admin";
import { useCabErrorText } from "./cab-shared";

/**
 * Dispatch actions for one trip: assign / reassign a driver and vehicle,
 * move it to an allowed next status (staff skip the pickup OTP), and copy
 * the driver's trip link. The server re-checks cabs.write and the SQL
 * functions re-check every transition.
 */
export function TripActions({
  tripId,
  canAssign,
  assigned,
  steps,
  drivers,
  vehicles,
  current,
}: {
  tripId: string;
  canAssign: boolean;
  /** A driver is assigned, so the link exists and "Reassign" is shown. */
  assigned: boolean;
  steps: TripStep[];
  drivers: { value: string; label: string }[];
  vehicles: VehicleChoice[];
  current: { driverId: string | null; vehicleId: string | null };
}) {
  const t = useTranslations("cabsAdmin");
  const errorText = useCabErrorText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [driverId, setDriverId] = useState(current.driverId ?? "");
  const [vehicleId, setVehicleId] = useState(current.vehicleId ?? "");

  const run = (
    action: () => Promise<TripActionResult>,
    success: string,
    after?: (r: TripActionResult) => void,
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
      {canAssign ? (
        <Button
          type="button"
          size="sm"
          variant={assigned ? "outline" : "default"}
          disabled={pending}
          onClick={() => setAssignOpen(true)}
        >
          <UserRoundCheck /> {assigned ? t("actions.reassign") : t("actions.assign")}
        </Button>
      ) : null}
      {steps.map((step) => (
        <Button
          key={step}
          type="button"
          size="sm"
          variant={step === "no_show" ? "outline" : "secondary"}
          className={step === "no_show" ? "text-destructive" : undefined}
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t("actions.confirmStep", { status: t(`status.${step}`) }))) return;
            run(
              () => setTripStatusAction({ tripId, status: step }),
              t("actions.stepDone", { status: t(`status.${step}`) }),
            );
          }}
        >
          {t(`actions.steps.${step}`)}
        </Button>
      ))}
      {assigned ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(
              () => driverLinkAction({ tripId }),
              "",
              (r) => {
                if ("url" in r) {
                  setLink(r.url);
                  void copy(r.url);
                }
              },
            )
          }
        >
          <Link2 /> {t("actions.copyLink")}
        </Button>
      ) : null}

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
              if (!driverId || !vehicleId) return toast.error(t("actions.pickBoth"));
              run(
                () => assignTripAction({ tripId, driverId, vehicleId }),
                t("actions.assignedToast"),
                (r) => {
                  if (r.ok) setAssignOpen(false);
                },
              );
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor={`v-${tripId}`}>{t("actions.vehicle")}</Label>
              <NativeSelect
                id={`v-${tripId}`}
                value={vehicleId}
                onChange={(e) => pickVehicle(e.target.value)}
              >
                <option value="">{t("actions.pickVehicle")}</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.upgrade ? `${v.label} — ${t("actions.upgrade")}` : v.label}
                  </option>
                ))}
              </NativeSelect>
              {vehicles.length === 0 ? (
                <p className="text-xs text-accent-amber">{t("actions.noVehicles")}</p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`d-${tripId}`}>{t("actions.driver")}</Label>
              <NativeSelect id={`d-${tripId}`} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
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
            {assigned ? <p className="text-xs text-muted-foreground">{t("actions.reassignHelp")}</p> : null}
            <Button type="submit" disabled={pending}>
              {assigned ? t("actions.reassign") : t("actions.assign")}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {link ? (
        <div className="flex w-full items-center gap-2">
          <Input
            readOnly
            value={link}
            aria-label={t("actions.driverLink")}
            className="h-9 font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => void copy(link)}>
            <Copy /> {t("actions.copy")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
