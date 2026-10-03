"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BadgePercent, Loader2, Lock, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { bookHotel, previewHotelCheckout, verifyHotelPayment, type BookResult } from "@/lib/bookings/actions";
import type { CheckoutPreview } from "@/lib/bookings/preview";
import { formatPaise } from "@/lib/money";
import { openRazorpay } from "@/lib/payments/checkout-client";
import type { AddonKey } from "@/lib/pricing/booking";
import { cn } from "@/lib/utils";
import { SavedTravellerPicker } from "./saved-traveller-picker";
import { guestDetailsFormSchema, type GuestDetailsInput, type PaymentModeKey } from "@/schemas/booking";

type Request = {
  hotel: string;
  plan: string;
  checkin: string;
  checkout: string;
  rooms: number;
  adults: number;
  children: number;
  locale: "en" | "hi";
};

type PendingOrder = Extract<BookResult, { status: "pending_payment" }>;

/**
 * Review-booking form: add-ons, coupon, payment option, guest and GST
 * details, and the price summary. Every change asks the server for a fresh
 * price; the booking action prices again and refuses if the total moved.
 */
export function CheckoutForm({
  request,
  initial,
  guestCount,
  defaults,
  coupons,
  hotelName,
  savedTravellers = [],
  children,
}: {
  request: Request;
  initial: CheckoutPreview;
  guestCount: number;
  defaults: { name: string; email: string; phone: string };
  coupons: { code: string; description: string }[];
  hotelName: string;
  /** The customer's saved travellers (account → Travellers), to fill guest names. */
  savedTravellers?: { id: string; name: string; phone: string | null }[];
  children: ReactNode;
}) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const [preview, setPreview] = useState(initial);
  const [addons, setAddons] = useState<Partial<Record<AddonKey, boolean>>>(() =>
    Object.fromEntries(initial.addons.filter((a) => a.selected).map((a) => [a.key, true])),
  );
  const [coupon, setCoupon] = useState<string | undefined>();
  const [couponInput, setCouponInput] = useState("");
  const [mode, setMode] = useState<PaymentModeKey>(initial.paymentMode);
  const [pricing, startPricing] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const requestId = useRef(0);

  const form = useForm<GuestDetailsInput>({
    resolver: zodResolver(guestDetailsFormSchema, undefined, { raw: true }),
    defaultValues: {
      name: defaults.name,
      email: defaults.email,
      phone: defaults.phone,
      guests: Array.from({ length: Math.max(0, guestCount - 1) }, () => ""),
      specialRequests: "",
      wantsGst: false,
      gst: undefined,
      acceptPolicies: false as unknown as true,
    },
  });
  const wantsGst = form.watch("wantsGst");
  const errorText = (key: string) =>
    t.has(`fieldErrors.${key}`) ? t(`fieldErrors.${key}`) : t("fieldErrors.invalid");

  function reprice(next: { addons?: typeof addons; coupon?: string | null; mode?: PaymentModeKey }) {
    const nextAddons = next.addons ?? addons;
    const nextCoupon = next.coupon === null ? undefined : (next.coupon ?? coupon);
    const nextMode = next.mode ?? mode;
    setAddons(nextAddons);
    setCoupon(nextCoupon);
    setMode(nextMode);
    const id = ++requestId.current;
    startPricing(async () => {
      const result = await previewHotelCheckout({
        ...request,
        addons: nextAddons,
        coupon: nextCoupon,
        paymentMode: nextMode,
      });
      if (id !== requestId.current) return;
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      setPreview(result);
      setMode(result.paymentMode);
      if (nextCoupon && result.couponError) {
        toast.error(t(`couponErrors.${result.couponError}`));
        setCoupon(undefined);
      } else if (nextCoupon && result.coupon && next.coupon) {
        toast.success(
          t("couponApplied", { amount: formatPaise(result.coupon.discountPaise, request.locale) }),
        );
      }
    });
  }

  async function pay(order: PendingOrder) {
    const opened = await openRazorpay({
      order: order.order,
      prefill: order.prefill,
      description: `${hotelName} · ${order.code}`,
      bookingCode: order.code,
      onSuccess: (response) =>
        startSubmit(async () => {
          const result = await verifyHotelPayment({ bookingCode: order.code, ...response });
          setPendingOrder(null);
          if (!result.ok) toast.error(t("paymentNotVerified"));
          router.push(`/account/trips/${order.code}`);
        }),
      onDismiss: () => setPendingOrder(order),
    });
    if (!opened) {
      toast.error(t("errors.payment_failed"));
      setPendingOrder(order);
    }
  }

  const onSubmit = form.handleSubmit(
    (guest) =>
      startSubmit(async () => {
        const result = await bookHotel({
          checkout: { ...request, addons, coupon, paymentMode: mode },
          guest,
          expectedTotalPaise: preview.totalPaise,
        });
        if (!result.ok) {
          if (result.preview) setPreview(result.preview);
          if (result.error === "signin") router.push("/login");
          toast.error(t(`errors.${result.error}`));
          return;
        }
        if (result.status === "confirmed") {
          router.push(`/account/trips/${result.code}`);
          return;
        }
        await pay(result);
      }),
    () => toast.error(t("fieldErrors.checkForm")),
  );

  const busy = submitting || pricing;
  const ctaLabel =
    mode === "pay_at_hotel"
      ? t("confirmBooking")
      : t("payNow", { amount: formatPaise(preview.payableNowPaise, request.locale) });
  const summary = (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
      <dt>{t("roomCharges")}</dt>
      <dd className="text-right">{formatPaise(preview.roomChargesPaise, request.locale)}</dd>
      {preview.extraGuestPaise ? (
        <>
          <dt className="text-muted-foreground">{t("includesExtraGuests")}</dt>
          <dd className="text-right text-muted-foreground">
            {formatPaise(preview.extraGuestPaise, request.locale)}
          </dd>
        </>
      ) : null}
      {preview.addons
        .filter((a) => a.selected)
        .map((a) => (
          <div key={a.key} className="contents">
            <dt>{t(`addons.${a.key}`)}</dt>
            <dd className="text-right">{formatPaise(a.amountPaise, request.locale)}</dd>
          </div>
        ))}
      {preview.feePaise ? (
        <>
          <dt>{t("convenienceFee")}</dt>
          <dd className="text-right">{formatPaise(preview.feePaise, request.locale)}</dd>
        </>
      ) : null}
      {preview.discountPaise ? (
        <>
          <dt className="text-accent-green">{t("discount", { code: preview.coupon?.code ?? "" })}</dt>
          <dd className="text-right text-accent-green">
            − {formatPaise(preview.discountPaise, request.locale)}
          </dd>
        </>
      ) : null}
      <dt>{t("taxes")}</dt>
      <dd className="text-right">{formatPaise(preview.taxPaise, request.locale)}</dd>
      <dt className="border-t pt-2 font-bold">{t("total")}</dt>
      <dd className="border-t pt-2 text-right text-lg font-extrabold">
        {formatPaise(preview.totalPaise, request.locale)}
      </dd>
      {mode !== "full" ? (
        <>
          <dt className="font-semibold text-primary">{t("payNowLabel")}</dt>
          <dd className="text-right font-semibold text-primary">
            {formatPaise(preview.payableNowPaise, request.locale)}
          </dd>
          <dt className="text-muted-foreground">{t("payAtHotelLabel")}</dt>
          <dd className="text-right text-muted-foreground">
            {formatPaise(preview.totalPaise - preview.payableNowPaise, request.locale)}
          </dd>
        </>
      ) : null}
    </dl>
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {children}

          {preview.addons.length ? (
            <section aria-labelledby="addons" className="space-y-3 rounded-2xl border bg-card p-4">
              <h2 id="addons" className="text-base font-bold">
                {t("addonsTitle")}
              </h2>
              <ul className="grid gap-2">
                {preview.addons.map((a) => (
                  <li key={a.key}>
                    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm has-[:checked]:border-primary">
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--primary)]"
                          checked={Boolean(addons[a.key])}
                          onChange={(e) => reprice({ addons: { ...addons, [a.key]: e.target.checked } })}
                        />
                        <span>
                          <span className="font-medium">{t(`addons.${a.key}`)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {t(`addonHints.${a.key}`)}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold">
                        {t(`addonPrice.${a.key === "breakfast" ? "perGuestNight" : "perRoom"}`, {
                          price: formatPaise(a.unitPaise, request.locale),
                        })}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="coupon" className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 id="coupon" className="flex items-center gap-2 text-base font-bold">
              <BadgePercent className="size-5 text-primary" aria-hidden="true" /> {t("couponTitle")}
            </h2>
            {preview.coupon ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-accent-green bg-accent-green/10 p-3 text-sm">
                <span>
                  <span className="font-bold">{preview.coupon.code}</span> ·{" "}
                  {t("couponSaving", { amount: formatPaise(preview.coupon.discountPaise, request.locale) })}
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => reprice({ coupon: null })}>
                  <X /> {t("removeCoupon")}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder={t("couponPlaceholder")}
                  aria-label={t("couponTitle")}
                  maxLength={24}
                  autoCapitalize="characters"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!couponInput.trim() || pricing}
                  onClick={() => reprice({ coupon: couponInput.trim() })}
                >
                  {t("applyCoupon")}
                </Button>
              </div>
            )}
            {!preview.coupon && coupons.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {coupons.map((c) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-dashed p-3 text-left text-sm hover:border-primary"
                      onClick={() => {
                        setCouponInput(c.code);
                        reprice({ coupon: c.code });
                      }}
                    >
                      <span className="font-bold">{c.code}</span>
                      {c.description ? (
                        <span className="block text-xs text-muted-foreground">{c.description}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section aria-labelledby="guest" className="space-y-4 rounded-2xl border bg-card p-4">
            <h2 id="guest" className="text-base font-bold">
              {t("guestTitle")}
            </h2>
            {savedTravellers.length ? (
              <SavedTravellerPicker
                travellers={savedTravellers}
                onPick={(p) => {
                  form.setValue("name", p.name, { shouldDirty: true, shouldValidate: true });
                  if (p.phone) form.setValue("phone", p.phone, { shouldDirty: true, shouldValidate: true });
                }}
              />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("fields.name")}</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage translateKey={errorText} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fields.phone")}</FormLabel>
                    <FormControl>
                      <Input type="tel" inputMode="tel" autoComplete="tel" {...field} />
                    </FormControl>
                    <FormMessage translateKey={errorText} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fields.email")}</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage translateKey={errorText} />
                  </FormItem>
                )}
              />
            </div>
            {guestCount > 1 ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("fields.otherGuests")}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: guestCount - 1 }, (_, i) => (
                    <Input
                      key={i}
                      aria-label={t("fields.guestN", { n: i + 2 })}
                      placeholder={t("fields.guestN", { n: i + 2 })}
                      list={savedTravellers.length ? "saved-traveller-names" : undefined}
                      {...form.register(`guests.${i}`)}
                    />
                  ))}
                </div>
              </fieldset>
            ) : null}
            <FormField
              control={form.control}
              name="specialRequests"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.specialRequests")}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={1000} {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="wantsGst"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-3 rounded-xl border p-3">
                  <FormLabel className="font-normal">{t("fields.wantsGst")}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={Boolean(field.value)}
                      onCheckedChange={(on) => {
                        field.onChange(on);
                        if (!on) form.setValue("gst", undefined);
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            {wantsGst ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="gst.gstin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.gstin")}</FormLabel>
                      <FormControl>
                        <Input
                          autoCapitalize="characters"
                          maxLength={15}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage translateKey={errorText} />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gst.company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.company")}</FormLabel>
                      <FormControl>
                        <Input autoComplete="organization" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage translateKey={errorText} />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gst.address"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("fields.companyAddress")}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            ) : null}
          </section>

          <section aria-labelledby="payment" className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 id="payment" className="text-base font-bold">
              {t("paymentTitle")}
            </h2>
            <div role="radiogroup" aria-labelledby="payment" className="grid gap-2">
              {preview.modes.map((m) => (
                <label
                  key={m}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm",
                    mode === m && "border-primary ring-1 ring-primary",
                  )}
                >
                  <input
                    type="radio"
                    name="paymentMode"
                    className="mt-0.5 size-5 accent-[var(--primary)]"
                    checked={mode === m}
                    onChange={() => reprice({ mode: m })}
                  />
                  <span>
                    <span className="font-medium">{t(`modes.${m}`)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`modeHints.${m}`, { percent: preview.advancePercent ?? 0 })}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <FormField
            control={form.control}
            name="acceptPolicies"
            render={({ field }) => (
              <FormItem>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <FormControl>
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 accent-[var(--primary)]"
                      checked={Boolean(field.value)}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                  </FormControl>
                  <span>{t("acceptPolicies")}</span>
                </label>
                <FormMessage translateKey={errorText} />
              </FormItem>
            )}
          />

          {pendingOrder ? (
            <div
              role="status"
              className="space-y-3 rounded-2xl border border-accent-orange bg-accent-orange/10 p-4 text-sm"
            >
              <p className="font-semibold">{t("paymentPending", { code: pendingOrder.code })}</p>
              <p>{t("paymentPendingHint", { minutes: preview.holdMinutes })}</p>
              <Button type="button" onClick={() => pay(pendingOrder)} disabled={busy}>
                {t("retryPayment")}
              </Button>
            </div>
          ) : null}
        </div>

        <aside aria-label={t("summaryTitle")} className="hidden lg:block">
          <div className="sticky top-20 space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t("summaryTitle")}</h2>
            <div className={cn("transition-opacity", pricing && "opacity-60")}>{summary}</div>
            <Button type="submit" size="lg" className="w-full" disabled={busy || Boolean(pendingOrder)}>
              {submitting ? <Loader2 className="animate-spin" /> : <Lock />} {ctaLabel}
            </Button>
            <p className="text-xs text-muted-foreground">{t("secureNote")}</p>
          </div>
        </aside>

        {/* Mobile: summary inline and a sticky pay bar. */}
        <section aria-label={t("summaryTitle")} className="rounded-2xl border bg-card p-4 lg:hidden">
          <h2 className="mb-3 text-base font-bold">{t("summaryTitle")}</h2>
          <div className={cn("transition-opacity", pricing && "opacity-60")}>{summary}</div>
        </section>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {mode === "full" ? t("total") : t("payNowLabel")}
              </p>
              <p className="text-lg font-extrabold">
                {formatPaise(mode === "full" ? preview.totalPaise : preview.payableNowPaise, request.locale)}
              </p>
            </div>
            <Button type="submit" size="lg" disabled={busy || Boolean(pendingOrder)}>
              {submitting ? <Loader2 className="animate-spin" /> : <Lock />}{" "}
              {mode === "pay_at_hotel" ? t("confirmBooking") : t("pay")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
