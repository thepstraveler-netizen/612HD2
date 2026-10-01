import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { ACCENT_CLASSES, getService, SERVICES } from "@/lib/services";
import { cn } from "@/lib/utils";

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => SERVICES.map((s) => ({ locale, slug: s.slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!getService(slug)) return {};
  const t = await getTranslations({ locale, namespace: "services" });
  return { title: t(`${slug}.name`), description: t(`${slug}.description`) };
}

/** Placeholder service page; each vertical replaces it in its own phase. */
export default async function ServicePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const service = getService(slug);
  if (!service) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const accent = ACCENT_CLASSES[service.accent];
  const Icon = service.icon;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/#services"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t("servicePage.back")}
      </Link>
      <div className="mt-4 flex items-start gap-4 rounded-2xl border bg-card p-6 shadow-sm">
        <span
          className={cn(
            "grid size-14 shrink-0 place-items-center rounded-full ring-4",
            accent.badge,
            accent.ring,
          )}
        >
          <Icon className="size-7" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <Badge variant="secondary">
            {service.kind === "bookable" ? t("servicePage.kindBookable") : t("servicePage.kindEnquiry")}
          </Badge>
          <h1 className="text-[length:var(--text-title)] font-bold">{t(`services.${slug}.name`)}</h1>
          <p className="text-muted-foreground">{t(`services.${slug}.description`)}</p>
          <p className="pt-2 text-sm">{t("servicePage.comingSoon")}</p>
        </div>
      </div>
    </div>
  );
}
