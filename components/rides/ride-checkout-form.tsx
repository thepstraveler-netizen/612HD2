"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { BadgePercent, Banknote, CheckCircle2, CreditCard, Loader2, Lock, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePathname, useRouter } from "@/i18n/navigation";
import { formatPaise } from "@/lib/money";
import { openRazorpay } from "@/lib/payments/checkout-client";
import { bookRide, previewRideCheckout, verifyRidePayment, type RideBookResult } from "@/lib/rides/actions";
import type { RidePreview } from "@/lib/rides/preview";
import { rideLineKey } from "@/lib/rides/ui";
import { cn } from "@/lib/utils";
import {
  ridePassengerSchema,
  type RideCheckoutInput,
  type RideMode,
  type RidePaymentMode,
} from "@/schemas/rides";

type Request = Omit<RideCheckoutInput, "coupon" | "pay"> & { v: string; locale: "en" | "hi" };
type PendingOrder = Extract<RideBookResult, { ok: true; status: "pending_payment" }>;

const formSchema = ridePassengerSchema.extend({
  acceptPolicies: z.literal(true, { error: "acceptPolicies" }),
});
type FormInput = z.input<typeof formSchema>;

/**
 * Ride review form: coupon, pay the driver or pay online, rider details and
 * the fare breakup. Every change asks the server for a fresh price; the
 * booking action prices again and refuses if the total moved.
 */
export function RideCheckoutForm({
  request,
  initial,
  mode: rideMode,
  defaults,
  coupons,
  description,
  children,
}: {
  request: Request;
  initial: RidePreview;
  mode: RideMode;
  defaults: { name: string; email: string; phone: string; pickupAddress: string; dropAddress: string };
  coupons: { code: string; description: string }[];
  /** Razorpay description, e.g. "Bike · ISKCON → Banke Bihari". */
  description: string;
  children: ReactNode;
}) {
  const t = useTranslations("rides.review");
  const tc = useTranslations("checkout");
  const tl = useTranslations("rides.lines");
  const te = useTranslations("rides.errors");
  const router = useRouter();
  const pathname = usePathname();
  const locale = request.locale;
  const [preview, setPreview] = useState(initial);
  const [coupon, setCoupon] = useState<string | undefined>();
  const [couponInput, setCouponInput] = useState("");
  const [pay, setPay] = useState<RidePaymentMode>(initial.pay);
  const [pricing, startPricing] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const requestId = useRef(0);

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema, undefined, { raw: true }),
    defaultValues: {
      name: defaults.name,
      email: defaults.email,
      phone: defaults.phone,
      pickupAddress: defaults.pickupAddress,
      dropAddress: defaults.dropAddress,
      notes: "",
      acceptPolicies: false as unknown as true,
    },
  });
  const errorText = (key: string) =>
    tc.has(`fieldErrors.${key}`) ? tc(`fieldErrors.${key}`) : tc("fieldErrors.invalid");
  const errorMessage = (key: string) =>
    te.has(`${key}.body`)
      ? te(`${key}.body`)
      : tc.has(`errors.${key}`)
        ? tc(`errors.${key}`)
        : tc("errors.unknown");
  const money = (paise: number) => formatPaise(paise, locale);
  const fail = (message: string) => {
    setFormError(message);
    toast.error(message);
  };

  function reprice(next: { coupon?: string | null; pay?: RidePaymentMode }) {
    const nextCoupon = next.coupon === null ? undefined : (next.coupon ?? coupon);
    const nextPay = next.pay ?? pay;
    setCoupon(nextCoupon);
    setPay(nextPay);
    setFormError(null);
    const id = ++requestId.current;
    startPricing(async () => {
      const result = await previewRideCheckout({ ...request, coupon: nextCoupon, pay: nextPay });
      if (id !== requestId.current) return;
      if (!result.ok) {
        fail(errorMessage(result.error));
        return;
      }
      setPreview(result);
      setPay(result.pay);
      if (nextCoupon && result.couponError) {
        fail(t(`couponErrors.${result.couponError}`));
        setCoupon(undefined);
      } else if (nextCoupon && result.coupon && next.coupon) {
        toast.success(tc("couponApplied", { amount: money(result.coupon.discountPaise) }));
      }
    });
  }

  async function openPayment(order: PendingOrder) {
    const opened = await openRazorpay({
      order: order.order,
      prefill: order.prefill,
      description: `${description} · ${order.code}`,
      bookingCode: order.code,
      onSuccess: (response) =>
        startSubmit(async () => {
          const result = await verifyRidePayment({ bookingCode: order.code, ...response });
          setPendingOrder(null);
          if (!result.ok) toast.error(tc("paymentNotVerified"));
          else toast.success(t("bookedOnline"));
          router.push(`/account/trips/${order.code}`);
        }),
      onDismiss: () => setPendingOrder(order),
    });
    if (!opened) {
      fail(tc("errors.payment_failed"));
      setPendingOrder(order);
    }
  }

  const onSubmit = form.handleSubmit(
    (values) =>
      startSubmit(async () => {
        setFormError(null);
        const passenger = {
          name: values.name,
          email: values.email,
          phone: values.phone,
          pickupAddress: values.pickupAddress,
          dropAddress: values.dropAddress?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
        };
        const result = await bookRide({
          checkout: { ...request, coupon, pay },
          passenger,
          expectedTotalPaise: preview.totalPaise,
        });
        if (!result.ok) {
          if (result.preview) {
            setPreview(result.preview);
            setPay(result.preview.pay);
            if (result.error === "coupon") setCoupon(undefined);
          }
          if (result.error === "signin") {
            const qs = typeof window === "undefined" ? "" : window.location.search;
            router.push(`/login?next=${encodeURIComponent(`${pathname}${qs}`)}`);
          }
          if (result.error === "payment_mode") reprice({});
          fail(errorMessage(result.error));
          return;
        }
        if (result.status === "confirmed") {
          toast.success(t(preview.instantBook ? "booked" : "requested", { code: result.code }));
          router.push(`/account/trips/${result.code}`);
          return;
        }
        await openPayment(result);
      }),
    () => toast.error(tc("fieldErrors.checkForm")),
  );

  const busy = submitting || pricing;
  const blocked = busy || Boolean(pendingOrder);
  const submitLabel =
    pay === "online" ? tc("payNow", { amount: money(preview.payableNowPaise) }) : t("confirmRide");
  const SubmitIcon = pay === "online" ? Lock : CheckCircle2;

  const summary = (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
      {preview.lines.map((line) => (
        <div key={line.key} className="contents">
          <dt>{tl(rideLineKey(line.key))}</dt>
          <dd className="text-right">{money(line.amountPaise)}</dd>
        </div>
      ))}
      {preview.discountPaise ? (
        <>
          <dt className="text-accent-green">{tc("discount", { code: preview.coupon?.code ?? "" })}</dt>
          <dd className="text-right text-accent-green">− {money(preview.discountPaise)}</dd>
        </>
      ) : null}
      <dt>{tc("taxes")}</dt>
      <dd className="text-right">{money(preview.taxPaise)}</dd>
      <dt className="border-t pt-2 font-bold">{tc("total")}</dt>
      <dd className="border-t pt-2 text-right text-lg font-extrabold">{money(preview.totalPaise)}</dd>
      {pay === "online" ? (
        <>
          <dt className="font-semibold text-primary">{tc("payNowLabel")}</dt>
          <dd className="text-right font-semibold text-primary">{money(preview.payableNowPaise)}</dd>
        </>
      ) : (
        <>
          <dt className="font-semibold text-primary">{t("payDriver")}</dt>
          <dd className="text-right font-semibold text-primary">{money(preview.balancePaise)}</dd>
        </>
      )}
    </dl>
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {children}

          <section aria-labelledby="ride-coupon" className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 id="ride-coupon" className="flex items-center gap-2 text-base font-bold">
              <BadgePercent className="size-5 text-primary" aria-hidden="true" /> {tc("couponTitle")}
            </h2>
            {preview.coupon ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-accent-green bg-accent-green/10 p-3 text-sm">
                <span>
                  <span className="font-bold">{preview.coupon.code}</span> ·{" "}
                  {tc("couponSaving", { amount: money(preview.coupon.discountPaise) })}
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => reprice({ coupon: null })}>
                  <X /> {tc("removeCoupon")}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder={tc("couponPlaceholder")}
                  aria-label={tc("couponTitle")}
                  maxLength={24}
                  autoCapitalize="characters"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!couponInput.trim() || pricing}
                  onClick={() => reprice({ coupon: couponInput.trim() })}
                >
                  {tc("applyCoupon")}
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

          <section aria-labelledby="ride-passenger" className="space-y-4 rounded-2xl border bg-card p-4">
            <h2 id="ride-passenger" className="text-base font-bold">
              {t("passengerTitle")}
            </h2>
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
                    <FormLabel>{tc("fields.phone")}</FormLabel>
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
              <FormField
                control={form.control}
                name="pickupAddress"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("fields.pickupAddress")}</FormLabel>
                    <FormControl>
                      <Textarea rows={2} maxLength={300} autoComplete="street-address" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{t("fields.pickupHint")}</p>
                    <FormMessage translateKey={errorText} />
                  </FormItem>
                )}
              />
              {rideMode === "point_to_point" ? (
                <FormField
                  control={form.control}
                  name="dropAddress"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("fields.dropAddress")}</FormLabel>
                      <FormControl>
                        <Textarea rows={2} maxLength={300} {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage translateKey={errorText} />
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("fields.notes")}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        maxLength={500}
                        placeholder={t("fields.notesPlaceholder")}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage translateKey={errorText} />
                  </FormItem>
                )}
              />
            </div>
          </section>

          <section aria-labelledby="ride-payment" className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 id="ride-payment" className="text-base font-bold">
              {tc("paymentTitle")}
            </h2>
            <div role="radiogroup" aria-labelledby="ride-payment" className="grid gap-2">
              {preview.payModes.map((m) => {
                const ModeIcon = m === "online" ? CreditCard : Banknote;
                return (
                  <label
                    key={m}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                      pay === m && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <input
                      type="radio"
                      name="pay"
                      className="mt-0.5 size-5 accent-[var(--primary)]"
                      checked={pay === m}
                      onChange={() => reprice({ pay: m })}
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-medium">
                        <ModeIcon className="size-4" aria-hidden="true" /> {t(`modes.${m}`)}
                      </span>
                      <span className="block text-xs text-muted-foreground">{t(`modeHints.${m}`)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {!preview.instantBook ? (
              <p className="text-xs text-muted-foreground">{t("onRequestPayment")}</p>
            ) : null}
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

          <p aria-live="assertive" className="empty:hidden">
            {formError ? (
              <span className="block rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {formError}
              </span>
            ) : null}
          </p>

          {pendingOrder ? (
            <div
              role="status"
              className="space-y-3 rounded-2xl border border-accent-orange bg-accent-orange/10 p-4 text-sm"
            >
              <p className="font-semibold">{tc("paymentPending", { code: pendingOrder.code })}</p>
              <p>{t("paymentPendingHint", { minutes: preview.holdMinutes })}</p>
              <Button type="button" onClick={() => openPayment(pendingOrder)} disabled={busy}>
                {tc("retryPayment")}
              </Button>
            </div>
          ) : null}
        </div>

        <aside aria-label={tc("summaryTitle")} className="hidden lg:block">
          <div className="sticky top-20 space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t("fareTitle")}</h2>
            <div className={cn("transition-opacity", pricing && "opacity-60")}>{summary}</div>
            <Button type="submit" size="lg" className="w-full" disabled={blocked}>
              {submitting ? <Loader2 className="animate-spin" /> : <SubmitIcon />} {submitLabel}
            </Button>
            <p className="text-xs text-muted-foreground">
              {pay === "online" ? tc("secureNote") : t("driverNote")}
            </p>
          </div>
        </aside>

        {/* Mobile: summary inline and a sticky confirm bar. */}
        <section aria-label={tc("summaryTitle")} className="rounded-2xl border bg-card p-4 lg:hidden">
          <h2 className="mb-3 text-base font-bold">{t("fareTitle")}</h2>
          <div className={cn("transition-opacity", pricing && "opacity-60")}>{summary}</div>
        </section>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {pay === "online" ? tc("payNowLabel") : t("payDriver")}
              </p>
              <p className="text-lg font-extrabold">
                {money(pay === "online" ? preview.payableNowPaise : preview.balancePaise)}
              </p>
            </div>
            <Button type="submit" size="lg" disabled={blocked}>
              {submitting ? <Loader2 className="animate-spin" /> : <SubmitIcon />}{" "}
              {pay === "online" ? tc("pay") : t("confirmShort")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
