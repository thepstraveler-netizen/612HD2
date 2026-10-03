"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { BadgePercent, CircleAlert, Loader2, Lock, MessageCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatPaise } from "@/lib/money";
import {
  bookPackage,
  previewPackageBooking,
  verifyPackagePayment,
  type PackageBookResult,
} from "@/lib/packages/actions";
import type { PackagePreview } from "@/lib/packages/checkout";
import { checkoutErrorKind, packageLineLabel } from "@/lib/packages/ui";
import { openRazorpay } from "@/lib/payments/checkout-client";
import { cn } from "@/lib/utils";
import {
  packageTravellersSchema,
  type PackageCheckoutInput,
  type PackageTravellersInput,
} from "@/schemas/packages";

type Request = Omit<PackageCheckoutInput, "coupon" | "paymentMode"> & {
  adults: number;
  children: number;
  locale: "en" | "hi";
};
type PendingOrder = Extract<PackageBookResult, { ok: true }>;

/**
 * Package checkout: coupon, advance or full payment, traveller details and
 * the price breakup. Every change asks the server for a fresh preview; the
 * booking action prices again and refuses if the total moved, then
 * Razorpay collects the amount and the trip page takes over.
 */
export function PackageCheckoutForm({
  request,
  initial,
  defaults,
  coupons,
  description,
  contact,
  packageHref,
  children,
}: {
  request: Request;
  initial: PackagePreview;
  defaults: { name: string; email: string; phone: string };
  coupons: { code: string; description: string }[];
  /** Razorpay description, e.g. "Braj 84 Kos Yatra · 12 Nov". */
  description: string;
  contact: { whatsapp: string | null };
  packageHref: string;
  children: ReactNode;
}) {
  const t = useTranslations("packages.checkout");
  const tp = useTranslations("packages");
  const tc = useTranslations("checkout");
  const router = useRouter();
  const pathname = usePathname();
  const locale = request.locale;
  const pax = request.adults + request.children;
  const [preview, setPreview] = useState(initial);
  const [coupon, setCoupon] = useState<string | undefined>();
  const [couponInput, setCouponInput] = useState("");
  const [mode, setMode] = useState<"full" | "part">(initial.paymentMode);
  const [pricing, startPricing] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const requestId = useRef(0);

  const form = useForm<PackageTravellersInput>({
    resolver: zodResolver(packageTravellersSchema, undefined, { raw: true }),
    defaultValues: {
      name: defaults.name,
      email: defaults.email,
      phone: defaults.phone,
      travellers: Array.from({ length: pax }, (_, i) => ({ name: i === 0 ? defaults.name : "", age: "" })),
      pickupPoint: "",
      specialRequests: "",
      acceptPolicies: false as unknown as true,
    },
  });
  const money = (paise: number) => formatPaise(paise, locale);
  const errorText = (key: string) =>
    tc.has(`fieldErrors.${key}`) ? tc(`fieldErrors.${key}`) : tc("fieldErrors.invalid");
  const errorMessage = (key: string) =>
    tp.has(`errors.${key}.body`)
      ? tp(`errors.${key}.body`)
      : tc.has(`errors.${key}`)
        ? tc(`errors.${key}`)
        : tc("errors.unknown");
  const lineText = (line: PackagePreview["lines"][number]) => {
    const label = packageLineLabel(line.key);
    return label ? tp(`lines.${label}`, { count: line.quantity }) : line.description;
  };

  function reprice(next: { coupon?: string | null; mode?: "full" | "part" }) {
    const nextCoupon = next.coupon === null ? undefined : (next.coupon ?? coupon);
    const nextMode = next.mode ?? mode;
    setCoupon(nextCoupon);
    setMode(nextMode);
    const id = ++requestId.current;
    startPricing(async () => {
      const result = await previewPackageBooking({ ...request, coupon: nextCoupon, paymentMode: nextMode });
      if (id !== requestId.current) return;
      if (!result.ok) {
        if (checkoutErrorKind(result.error) === "fatal") setFatal(result.error);
        else toast.error(errorMessage(result.error));
        return;
      }
      setPreview(result);
      setMode(result.paymentMode);
      if (nextCoupon && result.couponError) {
        toast.error(tc(`couponErrors.${result.couponError}`));
        setCoupon(undefined);
      } else if (nextCoupon && result.coupon && next.coupon) {
        toast.success(tc("couponApplied", { amount: money(result.coupon.discountPaise) }));
      }
    });
  }

  async function pay(order: PendingOrder) {
    const opened = await openRazorpay({
      order: order.order,
      prefill: order.prefill,
      description: `${description} · ${order.code}`,
      bookingCode: order.code,
      onSuccess: (response) =>
        startSubmit(async () => {
          const result = await verifyPackagePayment({ bookingCode: order.code, ...response });
          setPendingOrder(null);
          if (!result.ok) toast.error(tc("paymentNotVerified"));
          router.push(`/account/trips/${order.code}`);
        }),
      onDismiss: () => setPendingOrder(order),
    });
    if (!opened) {
      toast.error(tc("errors.payment_failed"));
      setPendingOrder(order);
    }
  }

  const onSubmit = form.handleSubmit(
    (values) =>
      startSubmit(async () => {
        const result = await bookPackage({
          checkout: { ...request, coupon, paymentMode: mode },
          details: values,
          expectedTotalPaise: preview.totalPaise,
        });
        if (!result.ok) {
          if (result.preview) {
            setPreview(result.preview);
            setMode(result.preview.paymentMode);
            if (result.error === "coupon") setCoupon(undefined);
          }
          if (result.error === "signin") {
            const qs = typeof window === "undefined" ? "" : window.location.search;
            router.push(`/login?next=${encodeURIComponent(`${pathname}${qs}`)}`);
          }
          if (result.error === "payment_mode") reprice({});
          if (checkoutErrorKind(result.error) === "fatal") {
            setFatal(result.error);
            return;
          }
          toast.error(errorMessage(result.error));
          return;
        }
        await pay(result);
      }),
    () => toast.error(tc("fieldErrors.checkForm")),
  );

  if (fatal) {
    return (
      <div role="alert" className="mx-auto max-w-xl space-y-4 rounded-2xl border bg-card p-6 text-center">
        <CircleAlert className="mx-auto size-10 text-accent-orange" aria-hidden="true" />
        <h2 className="text-xl font-bold">
          {tp.has(`errors.${fatal}.title`) ? tp(`errors.${fatal}.title`) : tp("errors.unknown.title")}
        </h2>
        <p className="text-muted-foreground">{errorMessage(fatal)}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href={packageHref}>{t("backToPackage")}</Link>
          </Button>
          {contact.whatsapp ? (
            <Button asChild variant="outline">
              <a
                href={`https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(description)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle /> {t("whatsapp")}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const busy = submitting || pricing;
  const blocked = busy || Boolean(pendingOrder) || !preview.online;

  const summary = (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
      {preview.lines.map((line) => (
        <div key={line.key} className="contents">
          <dt>{lineText(line)}</dt>
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
      {mode === "part" ? (
        <>
          <dt className="font-semibold text-primary">{tc("payNowLabel")}</dt>
          <dd className="text-right font-semibold text-primary">{money(preview.payableNowPaise)}</dd>
          <dt className="text-muted-foreground">{t("balanceLater")}</dt>
          <dd className="text-right text-muted-foreground">{money(preview.balancePaise)}</dd>
        </>
      ) : null}
    </dl>
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {children}

          <section aria-labelledby="pkg-coupon" className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 id="pkg-coupon" className="flex items-center gap-2 text-base font-bold">
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
                      className="min-h-11 w-full rounded-xl border border-dashed p-3 text-left text-sm hover:border-primary"
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

          <section aria-labelledby="pkg-contact" className="space-y-4 rounded-2xl border bg-card p-4">
            <h2 id="pkg-contact" className="text-base font-bold">
              {t("contactTitle")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("fields.name")}</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" maxLength={120} {...field} />
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
                    <FormLabel>{tc("fields.email")}</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        maxLength={200}
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

          <section aria-labelledby="pkg-travellers" className="space-y-4 rounded-2xl border bg-card p-4">
            <div>
              <h2 id="pkg-travellers" className="text-base font-bold">
                {t("travellersTitle")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("travellersHint")}</p>
            </div>
            <ul className="grid gap-3">
              {Array.from({ length: pax }, (_, i) => (
                <li key={i} className="grid grid-cols-[1fr_6rem] gap-2">
                  <Input
                    aria-label={t("fields.travellerName", { n: i + 1 })}
                    placeholder={t("fields.travellerName", { n: i + 1 })}
                    maxLength={120}
                    autoComplete="off"
                    {...form.register(`travellers.${i}.name`)}
                  />
                  <Input
                    aria-label={t("fields.travellerAge", { n: i + 1 })}
                    placeholder={t("fields.age")}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={120}
                    {...form.register(`travellers.${i}.age`)}
                  />
                </li>
              ))}
            </ul>
            <FormField
              control={form.control}
              name="pickupPoint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.pickupPoint")}</FormLabel>
                  <FormControl>
                    <Input maxLength={200} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">{t("fields.pickupHint")}</p>
                  <FormMessage translateKey={errorText} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="specialRequests"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.specialRequests")}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      maxLength={1000}
                      placeholder={t("fields.specialRequestsPlaceholder")}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </section>

          <section aria-labelledby="pkg-payment" className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 id="pkg-payment" className="text-base font-bold">
              {tc("paymentTitle")}
            </h2>
            <div role="radiogroup" aria-labelledby="pkg-payment" className="grid gap-2">
              {(preview.advancePaise !== null ? (["part", "full"] as const) : (["full"] as const)).map(
                (m) => (
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
                      <span className="font-medium">
                        {m === "part"
                          ? t("modes.part", { percent: preview.advancePercent })
                          : t("modes.full")}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {m === "part"
                          ? t("modeHints.part", {
                              advance: money(preview.advancePaise ?? 0),
                              balance: money(preview.totalPaise - (preview.advancePaise ?? 0)),
                            })
                          : t("modeHints.full", { total: money(preview.totalPaise) })}
                      </span>
                    </span>
                  </label>
                ),
              )}
            </div>
          </section>

          <FormField
            control={form.control}
            name="acceptPolicies"
            render={({ field }) => (
              <FormItem>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
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

          {!preview.online ? (
            <div
              role="status"
              className="space-y-3 rounded-2xl border border-accent-orange bg-accent-orange/10 p-4 text-sm"
            >
              <p>{t("offline")}</p>
              {contact.whatsapp ? (
                <Button asChild variant="outline">
                  <a
                    href={`https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(description)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle /> {t("whatsapp")}
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}

          {pendingOrder ? (
            <div
              role="status"
              className="space-y-3 rounded-2xl border border-accent-orange bg-accent-orange/10 p-4 text-sm"
            >
              <p className="font-semibold">{tc("paymentPending", { code: pendingOrder.code })}</p>
              <p>{t("paymentPendingHint", { minutes: preview.holdMinutes })}</p>
              <Button type="button" onClick={() => pay(pendingOrder)} disabled={busy}>
                {tc("retryPayment")}
              </Button>
            </div>
          ) : null}
        </div>

        <aside aria-label={tc("summaryTitle")} className="hidden lg:block">
          <div className="sticky top-20 space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t("priceTitle")}</h2>
            <div className={cn("transition-opacity", pricing && "opacity-60")}>{summary}</div>
            <Button type="submit" size="lg" className="w-full" disabled={blocked}>
              {submitting ? <Loader2 className="animate-spin" /> : <Lock />}{" "}
              {tc("payNow", { amount: money(preview.payableNowPaise) })}
            </Button>
            <p className="text-xs text-muted-foreground">{tc("secureNote")}</p>
          </div>
        </aside>

        {/* Mobile: summary inline and a sticky pay bar. */}
        <section aria-label={tc("summaryTitle")} className="rounded-2xl border bg-card p-4 lg:hidden">
          <h2 className="mb-3 text-base font-bold">{t("priceTitle")}</h2>
          <div className={cn("transition-opacity", pricing && "opacity-60")}>{summary}</div>
        </section>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {mode === "full" ? tc("total") : tc("payNowLabel")}
              </p>
              <p className="text-lg font-extrabold">{money(preview.payableNowPaise)}</p>
            </div>
            <Button type="submit" size="lg" disabled={blocked}>
              {submitting ? <Loader2 className="animate-spin" /> : <Lock />} {tc("pay")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
