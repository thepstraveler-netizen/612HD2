"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  BadgePercent,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { previewCart, placeOrder, verifyOrderPayment, type PlaceOrderResult } from "@/lib/delivery/actions";
import { lineKey } from "@/lib/delivery/cart";
import type { OrderPreview } from "@/lib/delivery/checkout";
import {
  cartRequestLines,
  freeDeliveryProgress,
  groupOrderLines,
  ORDER_CHECKOUT_PATH,
  SHOP_CONFIG,
} from "@/lib/delivery/ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { openRazorpay } from "@/lib/payments/checkout-client";
import { cn } from "@/lib/utils";
import { deliveryAddressSchema, orderCheckoutSchema, type OrderPaymentMode } from "@/schemas/delivery";
import { useCart, useHydrated } from "./cart-store";
import { DietMark } from "./diet-mark";

export type SavedAddress = {
  id: string;
  label: string;
  contactName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  pincode: string;
  zoneId: string | null;
  isDefault: boolean;
};

type PendingOrder = Extract<PlaceOrderResult, { ok: true; status: "pending_payment" }>;
type PreviewProblem = { error: string; itemId?: string };

const formSchema = deliveryAddressSchema.omit({ zoneId: true }).extend({
  email: orderCheckoutSchema.shape.email,
  notes: z.string().trim().max(500).optional(),
  saveAddress: z.boolean(),
});
type FormInput = z.input<typeof formSchema>;

const NEW = "new";

/**
 * Cart and checkout. The browser sends only the store, zone, lines (item,
 * variant, add-ons, quantity), coupon, payment choice and address; the
 * server prices it (debounced on every change) and prices it again when the
 * order is placed, refusing if the total moved since the last preview.
 */
export function OrderCheckout({
  locale,
  addresses,
  coupons,
  defaults,
}: {
  locale: "en" | "hi";
  addresses: SavedAddress[];
  coupons: { code: string; description: string; services: ("food" | "essentials")[] }[];
  defaults: { name: string; phone: string; email: string };
}) {
  const t = useTranslations("shop.checkout");
  const tl = useTranslations("shop.lines");
  const td = useTranslations("shop.diet");
  const tc = useTranslations("checkout");
  const router = useRouter();
  const hydrated = useHydrated();
  const [cart, dispatch] = useCart();
  const firstAddress = addresses[0];
  const [addressId, setAddressId] = useState<string>(firstAddress?.id ?? NEW);
  const [zoneId, setZoneId] = useState<string | undefined>(firstAddress?.zoneId ?? undefined);
  const [coupon, setCoupon] = useState<string | undefined>();
  const [couponInput, setCouponInput] = useState("");
  const [pay, setPay] = useState<OrderPaymentMode>("cod");
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [problem, setProblem] = useState<PreviewProblem | null>(null);
  const [pricing, startPricing] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const requestId = useRef(0);
  const announcedCoupon = useRef<string | undefined>(undefined);

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema, undefined, { raw: true }),
    defaultValues: {
      contactName: firstAddress?.contactName ?? defaults.name,
      phone: firstAddress?.phone ?? defaults.phone,
      line1: firstAddress?.line1 ?? "",
      line2: firstAddress?.line2 ?? "",
      landmark: firstAddress?.landmark ?? "",
      pincode: firstAddress?.pincode ?? "",
      email: defaults.email,
      notes: "",
      saveAddress: addresses.length === 0,
    },
  });

  const money = (paise: number) => formatPaise(paise, locale);
  const fieldError = (key: string) =>
    tc.has(`fieldErrors.${key}`)
      ? tc(`fieldErrors.${key}`)
      : t.has(`fieldErrors.${key}`)
        ? t(`fieldErrors.${key}`)
        : tc("fieldErrors.invalid");
  const itemName = (itemId: string | undefined) => {
    const line = cart.lines.find((l) => l.itemId === itemId);
    return line ? pickLocalized(line.label, locale) : "";
  };
  const errorMessage = (error: string, itemId?: string) =>
    t.has(`errors.${error}`)
      ? t(`errors.${error}`, { item: itemName(itemId) })
      : tc.has(`errors.${error}`)
        ? tc(`errors.${error}`)
        : t("errors.unknown");
  const fail = (message: string) => {
    setFormError(message);
    toast.error(message);
  };

  const storeId = cart.store?.storeId;
  const lines = cartRequestLines(cart);
  const linesSignature = JSON.stringify(lines);

  // Price on every change (debounced); the newest request wins.
  useEffect(() => {
    if (!hydrated || !storeId || lines.length === 0) return;
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      startPricing(async () => {
        const result = await previewCart({ storeId, zoneId, lines, coupon, pay });
        if (id !== requestId.current) return;
        if (!result.ok) {
          if (result.error === "zone_not_served") {
            // The saved area isn't served by this store: price without it and let the customer pick.
            toast.error(t("errors.zone_not_served"));
            setZoneId(undefined);
            return;
          }
          setProblem({ error: result.error, itemId: result.itemId });
          return;
        }
        setProblem(null);
        setPreview(result);
        setPay(result.pay);
        if (!zoneId && result.zones.length === 1) setZoneId(result.zones[0].id);
        if (coupon && result.couponError) {
          toast.error(t(`couponErrors.${result.couponError}`));
          setCoupon(undefined);
        } else if (coupon && result.coupon && announcedCoupon.current !== coupon) {
          announcedCoupon.current = coupon;
          toast.success(tc("couponApplied", { amount: money(result.coupon.discountPaise) }));
        }
      });
    }, 350);
    return () => window.clearTimeout(timer);
    // `lines` is captured through its signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, storeId, linesSignature, zoneId, coupon, pay]);

  function chooseAddress(id: string) {
    setAddressId(id);
    const a = addresses.find((x) => x.id === id);
    if (a) {
      form.reset({
        ...form.getValues(),
        contactName: a.contactName,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2,
        landmark: a.landmark,
        pincode: a.pincode,
        saveAddress: false,
      });
      if (a.zoneId) setZoneId(a.zoneId);
    } else {
      form.reset({
        ...form.getValues(),
        contactName: defaults.name,
        phone: defaults.phone,
        line1: "",
        line2: "",
        landmark: "",
        pincode: "",
        saveAddress: true,
      });
    }
  }

  function removeItem(itemId: string) {
    for (const l of cart.lines.filter((x) => x.itemId === itemId)) {
      dispatch({ type: "setQty", key: lineKey(l), qty: 0 });
    }
  }

  async function openPayment(order: PendingOrder) {
    const opened = await openRazorpay({
      order: order.order,
      prefill: order.prefill,
      description: `${cart.store?.name.en ?? preview?.storeName.en ?? ""} · ${order.code}`,
      bookingCode: order.code,
      onSuccess: (response) =>
        startSubmit(async () => {
          const result = await verifyOrderPayment({ bookingCode: order.code, ...response });
          setPendingOrder(null);
          if (!result.ok) toast.error(tc("paymentNotVerified"));
          else toast.success(t("placedOnline"));
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
        if (!storeId || !preview) return;
        if (!zoneId) {
          fail(t("errors.no_zone"));
          return;
        }
        const result = await placeOrder({
          checkout: {
            storeId,
            zoneId,
            lines,
            coupon,
            pay,
            address: {
              contactName: values.contactName,
              phone: values.phone,
              line1: values.line1,
              line2: values.line2?.trim() || undefined,
              landmark: values.landmark?.trim() || undefined,
              pincode: values.pincode?.trim() || "",
              zoneId,
            },
            email: values.email?.trim() || "",
            notes: values.notes?.trim() || undefined,
            saveAddress: addressId === NEW && values.saveAddress,
            locale,
          },
          expectedTotalPaise: preview.totalPaise,
        });
        if (!result.ok) {
          if (result.preview) {
            setPreview(result.preview);
            setPay(result.preview.pay);
            if (result.error === "coupon") setCoupon(undefined);
          }
          if (result.error === "signin") {
            router.push(`/login?next=${encodeURIComponent(ORDER_CHECKOUT_PATH)}`);
          }
          if (result.itemId) setProblem({ error: result.error, itemId: result.itemId });
          fail(errorMessage(result.error, result.itemId));
          return;
        }
        // The order exists now (stock is held); start a fresh cart.
        dispatch({ type: "clear" });
        if (result.status === "confirmed") {
          toast.success(t("placed", { code: result.code }));
          router.push(`/account/trips/${result.code}`);
          return;
        }
        setPendingOrder(result);
        await openPayment(result);
      }),
    () => toast.error(tc("fieldErrors.checkForm")),
  );

  if (!hydrated) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (pendingOrder) {
    return (
      <div
        role="status"
        className="space-y-3 rounded-2xl border border-accent-orange bg-accent-orange/10 p-5 text-sm"
      >
        <p className="text-base font-semibold">{tc("paymentPending", { code: pendingOrder.code })}</p>
        <p>{t("paymentPendingHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => openPayment(pendingOrder)} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Lock />} {tc("retryPayment")}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/account/trips/${pendingOrder.code}`}>{t("viewOrder")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!cart.store || cart.lines.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title={t("emptyTitle")}
        description={t("emptyBody")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/food">{t("browseFood")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/essentials">{t("browseEssentials")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const store = cart.store;
  const storeHref = `${SHOP_CONFIG[store.shop].path}/${store.slug}`;
  const zones = preview?.zones ?? [];
  const zone = zones.find((z) => z.id === zoneId);
  const progress = preview?.delivery
    ? freeDeliveryProgress(zone?.freeAbovePaise ?? null, preview.delivery.toFreePaise)
    : null;
  const shopCoupons = coupons.filter((c) => c.services.length === 0 || c.services.includes(store.shop));
  const blockingProblem = problem !== null;
  const short = preview?.shortOfMinimumPaise ?? 0;
  const busy = submitting || pricing;
  const canPlace = Boolean(preview) && !blockingProblem && !busy && short === 0 && Boolean(zoneId);
  const submitLabel =
    pay === "online" ? tc("payNow", { amount: money(preview?.payableNowPaise ?? 0) }) : t("placeOrder");
  const SubmitIcon = pay === "online" ? Lock : CheckCircle2;
  const savedInZone = (a: SavedAddress) =>
    !preview || (a.zoneId !== null && zones.some((z) => z.id === a.zoneId));

  const summary = preview ? (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
      {groupOrderLines(preview.priceLines).map((l, i) => (
        <div key={`${l.key}-${i}`} className="contents">
          <dt>{l.key === "other" ? (l.source?.description ?? "") : tl(l.key)}</dt>
          <dd className="text-right">{money(l.amountPaise)}</dd>
        </div>
      ))}
      {preview.delivery?.free ? (
        <>
          <dt className="text-accent-green">{tl("delivery")}</dt>
          <dd className="text-right text-accent-green">{t("free")}</dd>
        </>
      ) : null}
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
    </dl>
  ) : (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-6 w-full" />
    </div>
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="cart-title" className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="cart-title" className="text-base font-bold">
                {t("cartFrom", { store: pickLocalized(store.name, locale) })}
              </h2>
              <Link
                href={storeHref}
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
              >
                <Plus className="me-1 size-4" aria-hidden="true" /> {t("addMore")}
              </Link>
            </div>
            <ul className={cn("divide-y transition-opacity", pricing && "opacity-60")}>
              {cart.lines.map((l) => {
                const key = lineKey(l);
                const priced = preview?.lines.find((p) => lineKey(p) === key);
                const label = pickLocalized(l.label, locale);
                const flagged = problem?.itemId === l.itemId;
                return (
                  <li
                    key={key}
                    className={cn(
                      "flex items-center gap-3 py-3",
                      flagged && "rounded-xl bg-destructive/5 px-2",
                    )}
                  >
                    {priced ? <DietMark diet={priced.diet} label={td(priced.diet)} /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {money(priced?.unitPricePaise ?? l.unitPaise)} {t("each")}
                      </p>
                    </div>
                    <div className="flex h-10 items-center overflow-hidden rounded-xl border">
                      <button
                        type="button"
                        className="grid size-10 place-items-center hover:bg-accent"
                        onClick={() => dispatch({ type: "setQty", key, qty: l.qty - 1 })}
                        aria-label={t("decrease", { item: label })}
                      >
                        {l.qty === 1 ? (
                          <Trash2 className="size-4" aria-hidden="true" />
                        ) : (
                          <Minus className="size-4" aria-hidden="true" />
                        )}
                      </button>
                      <span className="min-w-6 text-center text-sm font-bold">{l.qty}</span>
                      <button
                        type="button"
                        className="grid size-10 place-items-center hover:bg-accent disabled:opacity-40"
                        onClick={() => dispatch({ type: "setQty", key, qty: l.qty + 1 })}
                        disabled={l.qty >= 20}
                        aria-label={t("increase", { item: label })}
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                    <span className="w-20 text-right text-sm font-semibold">
                      {money(priced?.lineTotalPaise ?? l.unitPaise * l.qty)}
                    </span>
                  </li>
                );
              })}
            </ul>

            {problem ? (
              <div
                role="alert"
                className="space-y-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
              >
                <p className="font-medium">{errorMessage(problem.error, problem.itemId)}</p>
                <div className="flex flex-wrap gap-2">
                  {problem.itemId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => removeItem(problem.itemId ?? "")}
                    >
                      <Trash2 /> {t("removeItem")}
                    </Button>
                  ) : null}
                  {problem.error === "not_found" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => dispatch({ type: "clear" })}
                    >
                      <X /> {t("clearCart")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {preview && short > 0 ? (
              <p
                role="status"
                className="rounded-xl bg-accent-orange/10 p-3 text-sm font-medium text-accent-orange"
              >
                {t("belowMinimum", { amount: money(short), minimum: money(preview.minOrderPaise) })}
              </p>
            ) : null}

            {preview?.delivery && progress !== null && preview.delivery.toFreePaise ? (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-sm">
                  <Truck className="size-4 text-primary" aria-hidden="true" />
                  {t("toFreeDelivery", { amount: money(preview.delivery.toFreePaise) })}
                </p>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                  aria-label={t("freeDeliveryProgress")}
                  className="h-2 overflow-hidden rounded-full bg-secondary"
                >
                  <div
                    className="h-full rounded-full bg-accent-green"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            ) : preview?.delivery?.free ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-accent-green">
                <Truck className="size-4" aria-hidden="true" /> {t("freeDeliveryUnlocked")}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="addr-title" className="space-y-4 rounded-2xl border bg-card p-4">
            <h2 id="addr-title" className="flex items-center gap-2 text-base font-bold">
              <MapPin className="size-5 text-primary" aria-hidden="true" /> {t("addressTitle")}
            </h2>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">{t("zone")}</span>
              <NativeSelect
                value={zoneId ?? ""}
                onChange={(e) => setZoneId(e.target.value || undefined)}
                required
              >
                <option value="">{t("zonePlaceholder")}</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {pickLocalized(z.name, locale)}
                    {z.feePaise > 0 ? ` · ${money(z.feePaise)}` : ` · ${t("free")}`}
                  </option>
                ))}
              </NativeSelect>
              <span className="block text-xs text-muted-foreground">{t("zoneHint")}</span>
            </label>

            {addresses.length ? (
              <div role="radiogroup" aria-label={t("savedAddresses")} className="grid gap-2 sm:grid-cols-2">
                {addresses.map((a) => {
                  const served = savedInZone(a);
                  return (
                    <label
                      key={a.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                        addressId === a.id && "border-primary ring-1 ring-primary",
                        !served && "opacity-60",
                      )}
                    >
                      <input
                        type="radio"
                        name="address"
                        className="mt-0.5 size-5 accent-[var(--primary)]"
                        checked={addressId === a.id}
                        onChange={() => chooseAddress(a.id)}
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold">{a.label}</span>
                        <span className="block text-muted-foreground">
                          {[a.line1, a.line2, a.landmark, a.pincode].filter(Boolean).join(", ")}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {a.contactName} · {a.phone}
                        </span>
                        {!served ? (
                          <span className="block text-xs text-destructive">{t("notServed")}</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                    addressId === NEW && "border-primary ring-1 ring-primary",
                  )}
                >
                  <input
                    type="radio"
                    name="address"
                    className="size-5 accent-[var(--primary)]"
                    checked={addressId === NEW}
                    onChange={() => chooseAddress(NEW)}
                  />
                  <Plus className="size-4" aria-hidden="true" /> {t("newAddress")}
                </label>
              </div>
            ) : null}

            <div
              className={cn("grid gap-4 sm:grid-cols-2", addressId !== NEW && "sr-only")}
              aria-hidden={addressId !== NEW}
            >
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fields.contactName")}</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" tabIndex={addressId !== NEW ? -1 : undefined} {...field} />
                    </FormControl>
                    <FormMessage translateKey={fieldError} />
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
                      <Input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        tabIndex={addressId !== NEW ? -1 : undefined}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage translateKey={fieldError} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="line1"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("fields.line1")}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="address-line1"
                        maxLength={200}
                        tabIndex={addressId !== NEW ? -1 : undefined}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage translateKey={fieldError} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="line2"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("fields.line2")}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="address-line2"
                        maxLength={200}
                        tabIndex={addressId !== NEW ? -1 : undefined}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage translateKey={fieldError} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="landmark"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fields.landmark")}</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={120}
                        tabIndex={addressId !== NEW ? -1 : undefined}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage translateKey={fieldError} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pincode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fields.pincode")}</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={6}
                        tabIndex={addressId !== NEW ? -1 : undefined}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage translateKey={fieldError} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="saveAddress"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <label className="flex cursor-pointer items-center gap-3 text-sm">
                      <FormControl>
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--primary)]"
                          tabIndex={addressId !== NEW ? -1 : undefined}
                          checked={Boolean(field.value)}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      </FormControl>
                      <span>{t("fields.saveAddress")}</span>
                    </label>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fields.email")}</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage translateKey={fieldError} />
                  </FormItem>
                )}
              />
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
                    <FormMessage translateKey={fieldError} />
                  </FormItem>
                )}
              />
            </div>
          </section>

          <section aria-labelledby="coupon-title" className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 id="coupon-title" className="flex items-center gap-2 text-base font-bold">
              <BadgePercent className="size-5 text-primary" aria-hidden="true" /> {tc("couponTitle")}
            </h2>
            {preview?.coupon ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-accent-green bg-accent-green/10 p-3 text-sm">
                <span>
                  <span className="font-bold">{preview.coupon.code}</span> ·{" "}
                  {tc("couponSaving", { amount: money(preview.coupon.discountPaise) })}
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCoupon(undefined)}>
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
                  onClick={() => setCoupon(couponInput.trim())}
                >
                  {tc("applyCoupon")}
                </Button>
              </div>
            )}
            {!preview?.coupon && shopCoupons.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {shopCoupons.map((c) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-dashed p-3 text-left text-sm hover:border-primary"
                      onClick={() => {
                        setCouponInput(c.code);
                        setCoupon(c.code);
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

          <section aria-labelledby="pay-title" className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 id="pay-title" className="text-base font-bold">
              {tc("paymentTitle")}
            </h2>
            {preview ? (
              <div role="radiogroup" aria-labelledby="pay-title" className="grid gap-2">
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
                        onChange={() => setPay(m)}
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
                {!preview.payModes.includes("cod") ? (
                  <p className="text-xs text-muted-foreground">
                    {t("codLimit", { amount: money(preview.maxCodPaise) })}
                  </p>
                ) : null}
              </div>
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </section>

          <p aria-live="assertive" className="empty:hidden">
            {formError ? (
              <span className="block rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {formError}
              </span>
            ) : null}
          </p>
        </div>

        <aside aria-label={tc("summaryTitle")} className="hidden lg:block">
          <div className="sticky top-20 space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t("billTitle")}</h2>
            {preview?.etaMinutes ? (
              <p className="text-sm text-muted-foreground">{t("eta", { minutes: preview.etaMinutes })}</p>
            ) : null}
            <div className={cn("transition-opacity", pricing && "opacity-60")} aria-live="polite">
              {summary}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={!canPlace}>
              {submitting ? <Loader2 className="animate-spin" /> : <SubmitIcon />} {submitLabel}
            </Button>
            <p className="text-xs text-muted-foreground">
              {pay === "online" ? tc("secureNote") : t("codNote")}
            </p>
          </div>
        </aside>

        <section aria-label={tc("summaryTitle")} className="rounded-2xl border bg-card p-4 lg:hidden">
          <h2 className="mb-3 text-base font-bold">{t("billTitle")}</h2>
          {preview?.etaMinutes ? (
            <p className="mb-2 text-sm text-muted-foreground">{t("eta", { minutes: preview.etaMinutes })}</p>
          ) : null}
          <div className={cn("transition-opacity", pricing && "opacity-60")}>{summary}</div>
        </section>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{tc("total")}</p>
              <p className="text-lg font-extrabold">{preview ? money(preview.totalPaise) : "…"}</p>
            </div>
            <Button type="submit" size="lg" disabled={!canPlace}>
              {submitting ? <Loader2 className="animate-spin" /> : <SubmitIcon />}{" "}
              {pay === "online" ? tc("pay") : t("placeShort")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
