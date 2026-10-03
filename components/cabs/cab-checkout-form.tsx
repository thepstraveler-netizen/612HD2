"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { BadgePercent, Loader2, Lock, MessageCircle, X } from "lucide-react";
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
import { bookCab, previewCabCheckout, verifyCabPayment, type CabBookResult } from "@/lib/cabs/actions";
import type { CabPreview } from "@/lib/cabs/preview";
import { fareLineKey } from "@/lib/cabs/ui";
import { formatPaise } from "@/lib/money";
import { openRazorpay } from "@/lib/payments/checkout-client";
import { cn } from "@/lib/utils";
import { cabPassengerSchema, type CabCheckoutInput } from "@/schemas/cabs";

type Request = Omit<CabCheckoutInput, "addons" | "coupon" | "paymentMode"> & {
  category: string;
  locale: "en" | "hi";
};
type PendingOrder = Extract<CabBookResult, { ok: true }>;

const formSchema = cabPassengerSchema.extend({
  acceptPolicies: z.literal(true, { error: "acceptPolicies" }),
});
type FormInput = z.input<typeof formSchema>;

/**
 * Cab review form: add-ons, coupon, part or full payment, passenger details
 * and the fare breakup. Every change asks the server for a fresh price; the
 * booking action prices again and refuses if the total moved.
 */
export function CabCheckoutForm({
  request,
  initial,
  addonInfo,
  defaults,
  coupons,
  description,
  contact,
  children,
}: {
  request: Request;
  initial: CabPreview;
  addonInfo: Record<string, { name: string; description: string }>;
  defaults: { name: string; email: string; phone: string };
  coupons: { code: string; description: string }[];
  /** Razorpay description, e.g. "Sedan · Vrindavan → Agra". */
  description: string;
  contact: { whatsapp: string | null };
  children: ReactNode;
}) {
  const t = useTranslations("cabs.review");
  const tc = useTranslations("checkout");
  const tl = useTranslations("cabs.lines");
  const te = useTranslations("cabs.errors");
  const router = useRouter();
  const pathname = usePathname();
  const locale = request.locale;
  const [preview, setPreview] = useState(initial);
  const [addons, setAddons] = useState<string[]>(initial.addons.filter((a) => a.selected).map((a) => a.key));
  const [coupon, setCoupon] = useState<string | undefined>();
  const [couponInput, setCouponInput] = useState("");
  const [mode, setMode] = useState<"full" | "part">(initial.paymentMode);
  const [pricing, startPricing] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const requestId = useRef(0);

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema, undefined, { raw: true }),
    defaultValues: {
      name: defaults.name,
      email: defaults.email,
      phone: defaults.phone,
      pickupAddress: "",
      dropAddress: "",
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

  function reprice(next: { addons?: string[]; coupon?: string | null; mode?: "full" | "part" }) {
    const nextAddons = next.addons ?? addons;
    const nextCoupon = next.coupon === null ? undefined : (next.coupon ?? coupon);
    const nextMode = next.mode ?? mode;
    setAddons(nextAddons);
    setCoupon(nextCoupon);
    setMode(nextMode);
    const id = ++requestId.current;
    startPricing(async () => {
      const result = await previewCabCheckout({
        ...request,
        addons: nextAddons,
        coupon: nextCoupon,
        paymentMode: nextMode,
      });
      if (id !== requestId.current) return;
      if (!result.ok) {
        toast.error(errorMessage(result.error));
        return;
      }
      setPreview(result);
      setMode(result.paymentMode);
      if (nextCoupon && result.couponError) {
        toast.error(t(`couponErrors.${result.couponError}`));
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
          const result = await verifyCabPayment({ bookingCode: order.code, ...response });
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
        const passenger = {
          name: values.name,
          email: values.email,
          phone: values.phone,
          pickupAddress: values.pickupAddress,
          dropAddress: values.dropAddress?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
        };
        const result = await bookCab({
          checkout: { ...request, addons, coupon, paymentMode: mode },
          passenger,
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
          toast.error(errorMessage(result.error));
          return;
        }
        await pay(result);
      }),
    () => toast.error(tc("fieldErrors.checkForm")),
  );

  const busy = submitting || pricing;
  const blocked = busy || Boolean(pendingOrder) || !preview.online;
  const partBalance = preview.advancePaise !== null ? preview.totalPaise - preview.advancePaise : 0;

  const summary = (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
      {preview.lines.map((line) => {
        const { label, addon } = fareLineKey(line.key);
        const text =
          label === "addon" && addon
            ? (addonInfo[addon]?.name ?? addon)
            : label === "allowance"
              ? tl("allowance", { days: line.quantity })
              : tl(label);
        return (
          <div key={line.key} className="contents">
            <dt>{text}</dt>
            <dd className="text-right">{money(line.amountPaise)}</dd>
          </div>
        );
      })}
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
          <dt className="text-muted-foreground">{t("payDriver")}</dt>
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

          {preview.addons.length ? (
            <section aria-labelledby="cab-addons" className="space-y-3 rounded-2xl border bg-card p-4">
              <h2 id="cab-addons" className="text-base font-bold">
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
                          checked={addons.includes(a.key)}
                          onChange={(e) =>
                            reprice({
                              addons: e.target.checked
                                ? [...addons, a.key]
                                : addons.filter((k) => k !== a.key),
                            })
                          }
                        />
                        <span>
                          <span className="font-medium">{addonInfo[a.key]?.name ?? a.key}</span>
                          {addonInfo[a.key]?.description ? (
                            <span className="block text-xs text-muted-foreground">
                              {addonInfo[a.key]?.description}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold">{money(a.pricePaise)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="cab-coupon" className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 id="cab-coupon" className="flex items-center gap-2 text-base font-bold">
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

          <section aria-labelledby="cab-passenger" className="space-y-4 rounded-2xl border bg-card p-4">
            <h2 id="cab-passenger" className="text-base font-bold">
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
                    <FormLabel>{tc("fields.email")}</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
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
              {request.type !== "local" && request.type !== "sightseeing" ? (
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
                        maxLength={1000}
                        placeholder={t("fields.notesPlaceholder")}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </section>

          <section aria-labelledby="cab-payment" className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 id="cab-payment" className="text-base font-bold">
              {tc("paymentTitle")}
            </h2>
            <div role="radiogroup" aria-labelledby="cab-payment" className="grid gap-2">
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
                      <span className="font-medium">{t(`modes.${m}`)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {m === "part"
                          ? t("modeHints.part", {
                              advance: money(preview.advancePaise ?? 0),
                              balance: money(partBalance),
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
            <h2 className="text-lg font-bold">{t("fareTitle")}</h2>
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
          <h2 className="mb-3 text-base font-bold">{t("fareTitle")}</h2>
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
