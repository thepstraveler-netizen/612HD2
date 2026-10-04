"use client";

import {
  Banknote,
  Bike,
  CheckCircle2,
  Copy,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  StickyNote,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { RiderOption, VendorOrder } from "@/lib/delivery/vendor";
import { vendorAssignRider, vendorMoveOrder, vendorRiderLink } from "@/lib/delivery/vendor-actions";
import type { VendorOrderAction } from "@/lib/delivery/vendor-ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

const DIET_DOT: Record<string, string> = {
  veg: "border-accent-green after:bg-accent-green",
  egg: "border-accent-orange after:bg-accent-orange",
  non_veg: "border-destructive after:bg-destructive",
};

const tel = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

function whatsappUrl(phone: string | null, message: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}

/**
 * One order on the store's board: what to cook or pack, where it goes,
 * cash to collect, the rider, and the next steps as large buttons.
 * Rejecting asks for a reason; delivering asks for the customer's OTP.
 */
export function VendorOrderCard({
  order,
  actions,
  riders,
  minutes,
  showStore,
}: {
  order: VendorOrder;
  actions: VendorOrderAction[];
  riders: RiderOption[];
  minutes: number;
  showStore: boolean;
}) {
  const t = useTranslations("vendorOrders");
  const locale = useLocale();
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<"rejected" | "delivered" | null>(null);
  const [reason, setReason] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [riderId, setRiderId] = useState("");
  const [link, setLink] = useState<{ url: string; phone: string | null } | null>(null);

  const move = (action: VendorOrderAction) => {
    if ((action.needsReason || action.needsOtp) && open !== action.status) {
      setOpen(action.status === "rejected" ? "rejected" : "delivered");
      setError(null);
      return;
    }
    start(async () => {
      setError(null);
      const result = await vendorMoveOrder({
        orderId: order.id,
        status: action.status,
        note: action.needsReason ? reason : undefined,
        otp: action.needsOtp ? otp : undefined,
      });
      if (result.ok) {
        toast.success(t(`done.${action.status}`, { code: order.code }));
        setOpen(null);
        setReason("");
        setOtp("");
        router.refresh();
        return;
      }
      setError(t(`errors.${result.error}`));
      if (result.error === "invalid_transition" || result.error === "not_found") router.refresh();
    });
  };

  const assign = () =>
    start(async () => {
      setError(null);
      const result = await vendorAssignRider({ orderId: order.id, partnerId: riderId });
      if (!result.ok) {
        setError(t(`errors.${result.error}`));
        return;
      }
      toast.success(t("rider.assigned"));
      setRiderId("");
      setLink(result.link ? { url: result.link, phone: result.riderPhone } : null);
      router.refresh();
    });

  const showLink = () =>
    start(async () => {
      setError(null);
      const result = await vendorRiderLink({ orderId: order.id });
      if (!result.ok) {
        setError(t(`errors.${result.error}`));
        return;
      }
      setLink({ url: result.link, phone: result.riderPhone });
    });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("rider.copied"));
    } catch {
      // Clipboard blocked: the link stays visible to copy by hand.
    }
  };

  const closed = order.status === "delivered" || order.status === "cancelled" || order.status === "rejected";
  const ownRider = order.partner && order.selfDelivery;

  return (
    <li
      className={cn(
        "space-y-3 rounded-2xl border bg-card p-4",
        order.status === "placed" && "border-2 border-accent-orange",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-base font-bold">{order.code}</p>
          <p className="text-xs text-muted-foreground">
            {showStore && order.storeName ? `${pickLocalized(order.storeName, locale)} · ` : null}
            {t("orders.minutesAgo", { count: minutes })}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            order.cod ? "bg-accent-orange/15 text-accent-orange" : "bg-accent-green/15 text-accent-green",
          )}
        >
          {order.cod ? t("orders.cod") : t("orders.paidOnline")}
        </span>
      </div>

      <ul className="space-y-1.5" aria-label={t("orders.items", { count: order.itemCount })}>
        {order.items.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            {item.diet && DIET_DOT[item.diet] ? (
              <span
                role="img"
                aria-label={t(`diet.${item.diet}`)}
                className={cn(
                  "relative mt-1 grid size-3.5 shrink-0 place-items-center rounded-sm border-2 after:size-1.5 after:rounded-full",
                  DIET_DOT[item.diet],
                )}
              />
            ) : (
              <span className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="font-semibold">
                {item.quantity} × {item.name}
              </span>
              {item.variantName ? <span className="text-muted-foreground"> ({item.variantName})</span> : null}
              {item.addons.length ? (
                <span className="block text-xs text-muted-foreground">+ {item.addons.join(", ")}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {order.notes ? (
        <p className="flex items-start gap-2 rounded-xl bg-accent-orange/10 p-3 text-sm">
          <StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">{t("orders.notes")}: </span>
            {order.notes}
          </span>
        </p>
      ) : null}

      <div className="space-y-1 border-t pt-3 text-sm">
        <p className="flex items-center justify-between gap-2">
          <span className="font-semibold">{order.customerName}</span>
          {order.customerPhone ? (
            <a
              href={tel(order.customerPhone)}
              className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-1 font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Phone className="size-4" aria-hidden="true" /> {order.customerPhone}
            </a>
          ) : null}
        </p>
        <p className="flex items-start gap-2 text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {order.address.text}
            {order.address.landmark
              ? ` · ${t("orders.landmark", { landmark: order.address.landmark })}`
              : null}
          </span>
        </p>
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Banknote className="size-4" aria-hidden="true" />
        {order.collectPaise > 0 ? (
          <span className="font-bold">
            {t("orders.collect", { amount: formatPaise(order.collectPaise, locale) })}
          </span>
        ) : (
          <span>{t("orders.paidAmount", { amount: formatPaise(order.paidOnlinePaise, locale) })}</span>
        )}
        <span className="text-muted-foreground">
          {t("orders.total", { amount: formatPaise(order.totalPaise, locale) })}
        </span>
      </p>

      <div className="space-y-2 border-t pt-3 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <Bike className="size-4" aria-hidden="true" />
          {order.partner ? (
            <>
              <span className="font-medium">{order.partner.name}</span>
              {order.partner.phone ? (
                <a
                  href={tel(order.partner.phone)}
                  className="inline-flex min-h-11 items-center rounded-lg text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {order.partner.phone}
                </a>
              ) : null}
              {!order.selfDelivery ? (
                <span className="text-xs text-muted-foreground">{t("rider.platformHint")}</span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">{t("rider.none")}</span>
          )}
        </p>
        {!closed && riders.length ? (
          <div className="flex gap-2">
            <label htmlFor={`${uid}-rider`} className="sr-only">
              {t("rider.choose")}
            </label>
            <NativeSelect
              id={`${uid}-rider`}
              value={riderId}
              onChange={(e) => setRiderId(e.target.value)}
              className="min-w-0 flex-1"
            >
              <option value="">{order.partner ? t("rider.reassign") : t("rider.choose")}</option>
              {riders.map((r) => (
                <option key={r.id} value={r.id} disabled={r.id === order.partner?.id}>
                  {[r.name, r.vehicle, r.own ? t("rider.own") : t("rider.platform")]
                    .filter(Boolean)
                    .join(" · ")}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={pending || !riderId}
              onClick={assign}
            >
              {t("rider.assign")}
            </Button>
          </div>
        ) : null}
        {!closed && ownRider && !link ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 sm:h-9"
            disabled={pending}
            onClick={showLink}
          >
            {t("rider.showLink")}
          </Button>
        ) : null}
        {link ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              readOnly
              value={link.url}
              aria-label={t("rider.link")}
              className="h-11 min-w-0 basis-full font-mono text-xs sm:h-9 sm:grow sm:basis-0"
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-11 flex-1 sm:h-9 sm:flex-none"
              onClick={() => void copy(link.url)}
            >
              <Copy /> {t("rider.copy")}
            </Button>
            <Button asChild size="sm" variant="outline" className="h-11 flex-1 sm:h-9 sm:flex-none">
              <a
                href={whatsappUrl(link.phone, t("rider.whatsappText", { code: order.code, link: link.url }))}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle /> {t("rider.whatsapp")}
              </a>
            </Button>
          </div>
        ) : null}
      </div>

      {open === "rejected" ? (
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-reason`} className="block text-sm font-semibold">
            {t("orders.rejectReason")}
          </label>
          <Textarea
            id={`${uid}-reason`}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("orders.rejectPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("orders.rejectHelp")}</p>
        </div>
      ) : null}
      {open === "delivered" ? (
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-otp`} className="block text-sm font-semibold">
            {t("orders.otpLabel")}
          </label>
          <input
            id={`${uid}-otp`}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{4}"
            maxLength={4}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="h-14 w-full rounded-xl border-2 border-input bg-background text-center font-mono text-2xl font-bold tracking-[0.5em] focus-visible:border-primary focus-visible:outline-none"
          />
          <p className="text-xs text-muted-foreground">{t("orders.otpHint")}</p>
        </div>
      ) : null}

      <p aria-live="assertive" className="empty:hidden">
        {error ? (
          <span className="block rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
            {error}
          </span>
        ) : null}
      </p>

      {actions.length ? (
        // One-handed: the main step is a full-width button; the rest share a row, and
        // Reject stays an outline until it is being confirmed.
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => {
            const confirming = open === action.status;
            const wide = action.primary || actions.filter((a) => !a.primary).length < 2;
            const disabled =
              pending ||
              (confirming && action.needsReason && reason.trim().length < 3) ||
              (confirming && action.needsOtp && otp.length !== 4);
            return (
              <Button
                key={action.status}
                type="button"
                size="lg"
                variant={
                  action.needsReason
                    ? confirming
                      ? "destructive"
                      : "outline"
                    : action.primary
                      ? "default"
                      : "outline"
                }
                className={cn(
                  "h-14 text-base font-bold whitespace-normal",
                  wide && "col-span-2",
                  !action.primary && !confirming && "h-12 text-sm leading-tight",
                  action.needsReason &&
                    !confirming &&
                    "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
                )}
                disabled={disabled}
                onClick={() => move(action)}
              >
                {pending ? <Loader2 className="animate-spin" /> : null}
                {confirming ? t(`confirm.${action.status}`) : t(`actions.${action.status}`)}
              </Button>
            );
          })}
          {open ? (
            <Button
              type="button"
              variant="ghost"
              className="col-span-2"
              onClick={() => {
                setOpen(null);
                setError(null);
              }}
            >
              {t("orders.back")}
            </Button>
          ) : null}
        </div>
      ) : !closed ? (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          {t("orders.riderWillDeliver")}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="size-4 text-accent-green" aria-hidden="true" />{" "}
          {t(`status.${order.status}`)}
        </p>
      )}
    </li>
  );
}
