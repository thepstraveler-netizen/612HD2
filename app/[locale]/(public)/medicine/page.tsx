import { BadgeCheck, ClipboardCheck, FileUp, LogIn, Pill, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrderingPaused } from "@/components/delivery/ordering-paused";
import { PrescriptionForm } from "@/components/delivery/prescription-form";
import { TempleSkyline } from "@/components/shared/motifs";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import { getFeatureFlag } from "@/lib/bookings/settings";
import { getDeliverySettings, getDeliveryZones, getStores } from "@/lib/delivery/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { createClient } from "@/lib/supabase/server";
import { pageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "medicine" });
  return pageMetadata({
    locale,
    path: "/medicine",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

/**
 * Medicine delivery: never a catalog. The customer uploads a prescription;
 * a licensed partner pharmacy reviews it and sends a quote, which the
 * customer accepts on My prescriptions.
 */
export default async function MedicinePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("medicine");
  const [session, settings, zones, open, pharmacies] = await Promise.all([
    getSession(),
    getDeliverySettings(),
    getDeliveryZones(),
    getFeatureFlag("booking.medicine"),
    getStores("pharmacy"),
  ]);
  const notice = pickLocalized(settings.medicine_notice, locale);
  const pharmacyZones = new Set(pharmacies.flatMap((p) => p.zoneIds));
  const servedZones = (pharmacies.length ? zones.filter((z) => pharmacyZones.has(z.id)) : zones).map((z) => ({
    id: z.id,
    name: pickLocalized(z.name, locale),
  }));

  let defaults: {
    name: string;
    phone: string;
    address: { line1: string; line2: string; landmark: string; pincode: string; zoneId: string } | null;
  } = {
    name: session?.profile?.full_name ?? "",
    phone: session?.profile?.phone ?? "",
    address: null,
  };
  if (session) {
    const supabase = await createClient();
    const { data: saved } = await supabase
      .from("addresses")
      .select("contact_name, phone, line1, line2, landmark, pincode, zone_id")
      .eq("user_id", session.user.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (saved) {
      defaults = {
        name: saved.contact_name || defaults.name,
        phone: saved.phone || defaults.phone,
        address: {
          line1: saved.line1,
          line2: saved.line2 ?? "",
          landmark: saved.landmark ?? "",
          pincode: saved.pincode ?? "",
          zoneId: saved.zone_id && servedZones.some((z) => z.id === saved.zone_id) ? saved.zone_id : "",
        },
      };
    }
  }

  const steps = [
    { icon: FileUp, key: "upload" },
    { icon: ClipboardCheck, key: "review" },
    { icon: BadgeCheck, key: "quote" },
    { icon: Truck, key: "deliver" },
  ] as const;

  return (
    <>
      <section className="relative isolate overflow-hidden pb-14">
        <Image
          src="/images/medicine-hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-[70%_center]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-b from-black/75 via-black/50 to-background"
        />
        <div className="mx-auto max-w-5xl space-y-4 px-4 pt-8 sm:pt-12">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-medium text-primary shadow-sm">
            <Pill className="size-4" aria-hidden="true" /> {t("eyebrow")}
          </p>
          <h1 className="text-[length:var(--text-display)] leading-tight font-extrabold tracking-tight !text-white drop-shadow-md">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-lg text-white/90 drop-shadow">{t("subtitle")}</p>
          <aside
            aria-labelledby="medicine-notice"
            className="flex items-start gap-3 rounded-2xl border-2 border-primary/40 bg-card p-4 text-sm"
          >
            <ShieldCheck className="size-6 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1">
              <h2 id="medicine-notice" className="font-bold">
                {t("noticeTitle")}
              </h2>
              <p data-testid="medicine-notice">{notice}</p>
              <p className="text-muted-foreground">{t("licensedOnly")}</p>
            </div>
          </aside>
          {!open ? <OrderingPaused shop="medicine" /> : null}
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
        <section aria-labelledby="rx-how" className="space-y-4">
          <h2 id="rx-how" className="text-xl font-bold text-heading">
            {t("howTitle")}
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, key }, i) => (
              <li key={key} className="flex gap-3 rounded-2xl border bg-card p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold">
                    {i + 1}. {t(`steps.${key}.title`)}
                  </span>
                  <span className="block text-sm text-muted-foreground">{t(`steps.${key}.body`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="rx-form" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="rx-form" className="text-xl font-bold text-heading">
              {t("form.title")}
            </h2>
            {session ? (
              <Link
                href="/account/prescriptions"
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
              >
                {t("form.myPrescriptions")}
              </Link>
            ) : null}
          </div>
          {!session ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="font-semibold">{t("signin.title")}</p>
                <p className="text-muted-foreground">{t("signin.body")}</p>
              </div>
              <Button asChild>
                <Link href={`/login?next=${encodeURIComponent("/medicine")}`}>
                  <LogIn /> {t("signin.cta")}
                </Link>
              </Button>
            </div>
          ) : !open ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("form.closed")}
            </p>
          ) : servedZones.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("form.noZones")}
            </p>
          ) : (
            <PrescriptionForm userId={session.user.id} zones={servedZones} defaults={defaults} />
          )}
        </section>

        {pharmacies.length ? (
          <section aria-labelledby="rx-partners" className="space-y-3">
            <h2 id="rx-partners" className="text-xl font-bold text-heading">
              {t("partnersTitle")}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {pharmacies.map((p) => (
                <li key={p.id} className="space-y-1 rounded-2xl border bg-card p-4 text-sm">
                  <p className="font-semibold">{pickLocalized(p.name, locale)}</p>
                  {p.address ? <p className="text-muted-foreground">{p.address}</p> : null}
                  {p.drugLicenceNo ? (
                    <p className="text-xs text-muted-foreground">
                      {t("licence", { number: p.drugLicenceNo })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
