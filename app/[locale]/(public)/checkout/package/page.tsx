import {
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DurationText, PackageImage } from "@/components/packages/package-card";
import { PackageCheckoutForm } from "@/components/packages/package-checkout-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getBusinessInfo } from "@/lib/catalog/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { preparePackageCheckout, toPackagePreview } from "@/lib/packages/checkout";
import {
  formatTourDate,
  PACKAGE_CHECKOUT_PATH,
  packageCheckoutQuery,
  parsePackageCheckoutQuery,
} from "@/lib/packages/ui";
import { createPublicClient } from "@/lib/supabase/public";
import { packageCheckoutSchema } from "@/schemas/packages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "packages.checkout" });
  return { title: t("title"), robots: { index: false } };
}

/** Public coupons valid for packages, suggested under the coupon box. */
async function suggestedCoupons(locale: string) {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("coupons")
    .select("code, description, services")
    .eq("is_public", true)
    .is("user_id", null)
    .order("code")
    .limit(10);
  return (data ?? [])
    .filter((c) => c.services.length === 0 || c.services.includes("package"))
    .map((c) => ({ code: c.code, description: c.description ? pickLocalized(c.description, locale) : "" }));
}

/**
 * Package checkout (sign-in required). The URL carries what the booking
 * widget chose; the server prices it here and on every change, exactly
 * like the cab review page.
 */
export default async function PackageCheckoutPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const request = parsePackageCheckoutQuery(await searchParams);
  const qs = new URLSearchParams(packageCheckoutQuery(request)).toString();
  const session = await requireUser(`${PACKAGE_CHECKOUT_PATH}?${qs}`);
  const t = await getTranslations("packages");
  const lang = locale === "hi" ? "hi" : "en";

  const parsed = packageCheckoutSchema.safeParse({ ...request, locale: lang });
  const [result, business] = await Promise.all([
    parsed.success ? preparePackageCheckout(parsed.data, session.user.id) : null,
    getBusinessInfo(),
  ]);
  const whatsapp = business.whatsapp.replace(/[^0-9]/g, "") || null;
  const packageHref = request.packageSlug ? `/packages/${request.packageSlug}` : "/packages";

  if (!result?.ok) {
    const reason = result && !result.ok ? result.error : "invalid";
    const key = t.has(`errors.${reason}.title`) ? reason : "unknown";
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-12 text-center">
        <CircleAlert className="mx-auto size-10 text-accent-orange" aria-hidden="true" />
        <h1 className="text-2xl font-bold">{t(`errors.${key}.title`)}</h1>
        <p className="text-muted-foreground">{t(`errors.${key}.body`)}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href={packageHref}>{t("checkout.backToPackage")}</Link>
          </Button>
          {whatsapp ? (
            <Button asChild variant="outline">
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
                <MessageCircle /> {t("checkout.whatsapp")}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const { pkg } = result;
  const preview = toPackagePreview(result);
  const coupons = await suggestedCoupons(locale);
  const title = pickLocalized(pkg.title, locale);
  const dates = `${formatTourDate(result.startDate, locale)} – ${formatTourDate(result.endDate, locale)}`;

  const details = (
    <div className="space-y-6">
      <section aria-labelledby="pkg-trip" className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid gap-4 p-4 sm:grid-cols-[9rem_1fr]">
          <PackageImage src={pkg.imageUrl} sizes="9rem" className="aspect-[4/3] w-32 rounded-xl sm:w-full" />
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-primary">
              <DurationText days={pkg.days} nights={pkg.nights} />
            </p>
            <h2 id="pkg-trip" className="text-lg leading-snug font-bold">
              {title}
            </h2>
            {pkg.destinations.length ? (
              <p className="flex items-start gap-1 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {pkg.destinations.join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t bg-border text-sm">
          <div className="bg-card p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" /> {t("checkout.dates")}
            </dt>
            <dd className="font-semibold">{dates}</dd>
          </div>
          <div className="bg-card p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3.5" aria-hidden="true" /> {t("checkout.travellers")}
            </dt>
            <dd className="font-semibold">
              {t("checkout.travellersValue", { adults: result.adults, children: result.children })}
            </dd>
          </div>
        </dl>
        <p className="border-t px-4 py-2 text-sm">
          <Link href={packageHref} className="inline-flex min-h-11 items-center font-medium text-primary">
            {t("checkout.change")}
          </Link>
        </p>
      </section>

      <section aria-labelledby="pkg-policy" className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
        <h2 id="pkg-policy" className="flex items-center gap-2 text-base font-bold">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" /> {t("detail.policy")}
        </h2>
        <p className="whitespace-pre-line">{pickLocalized(result.settings.cancellation_policy, locale)}</p>
        {pkg.terms ? (
          <p className="whitespace-pre-line text-muted-foreground">{pickLocalized(pkg.terms, locale)}</p>
        ) : null}
      </section>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-32 sm:py-8 lg:pb-8">
      <Link
        href={packageHref}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("checkout.backToPackage")}
      </Link>
      <h1 className="text-[length:var(--text-title)] leading-tight font-extrabold">{t("checkout.title")}</h1>
      <PackageCheckoutForm
        request={{
          packageSlug: pkg.slug,
          departureId: result.departure?.id,
          startDate: result.startDate,
          adults: result.adults,
          children: result.children,
          locale: lang,
        }}
        initial={preview}
        defaults={{
          name: session.profile?.full_name ?? "",
          email: session.user.email ?? "",
          phone: session.profile?.phone ?? "",
        }}
        coupons={coupons}
        description={`${pkg.title.en} · ${result.startDate}`}
        contact={{ whatsapp }}
        packageHref={packageHref}
      >
        {details}
      </PackageCheckoutForm>
    </div>
  );
}
