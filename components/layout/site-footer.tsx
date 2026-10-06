import { ChevronDown, MapPin, MessageCircle, Phone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/shared/logo";
import { PeacockFeather, TempleSkyline } from "@/components/shared/motifs";
import { Link } from "@/i18n/navigation";
import { getBusinessInfo, getNavigation, getServices } from "@/lib/catalog/queries";
import { pickLocalized } from "@/lib/i18n/localized";

export async function SiteFooter() {
  const [t, locale, services, company, legal, business] = await Promise.all([
    getTranslations(),
    getLocale(),
    getServices(),
    getNavigation("footer_company"),
    getNavigation("footer_legal"),
    getBusinessInfo(),
  ]);
  const year = new Date().getFullYear();
  const whatsapp = business.whatsapp.replace(/[^0-9]/g, "");

  return (
    <footer className="relative mt-16 bg-brand-navy-deep text-white">
      <TempleSkyline className="absolute -top-[59px] h-[60px] text-brand-navy-deep" />
      <PeacockFeather className="absolute top-6 right-4 hidden text-white/60 md:block" />
      <div className="mx-auto grid max-w-7xl gap-0 px-4 pt-10 pb-4 sm:grid-cols-2 sm:gap-10 sm:py-12 lg:grid-cols-4">
        <div className="space-y-3 border-white/10 max-sm:border-b max-sm:pb-6">
          <div className="flex items-center gap-3">
            <LogoMark className="size-12" />
            <span className="font-script text-xl font-bold">{t("brand.name")}</span>
          </div>
          <p className="text-sm text-white/75">{t("brand.tagline")}</p>
          <p className="flex items-center gap-1.5 text-sm text-white/75">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            {business.address || `${t("brand.location")} · ${t("brand.locationTag")}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {business.phone ? (
              <a
                href={`tel:${business.phone.replace(/\s/g, "")}`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white/10 px-4 text-sm"
              >
                <Phone className="size-4" aria-hidden="true" /> {t("contact.call")}
              </a>
            ) : null}
            {whatsapp ? (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent-green px-4 text-sm"
              >
                <MessageCircle className="size-4" aria-hidden="true" /> {t("contact.whatsapp")}
              </a>
            ) : null}
          </div>
        </div>
        <FooterColumn title={t("footer.services")}>
          {services
            .filter((s) => s.kind === "bookable")
            .slice(0, 7)
            .map((s) => (
              <FooterLink key={s.id} href={`/services/${s.slug}`}>
                {pickLocalized(s.name, locale)}
              </FooterLink>
            ))}
        </FooterColumn>
        <FooterColumn title={t("servicesIndex.enquiry")}>
          {services
            .filter((s) => s.kind === "enquiry")
            .slice(0, 7)
            .map((s) => (
              <FooterLink key={s.id} href={`/services/${s.slug}`}>
                {pickLocalized(s.name, locale)}
              </FooterLink>
            ))}
        </FooterColumn>
        <FooterColumn title={t("footer.company")}>
          {[...company, ...legal].map((link) => (
            <FooterLink key={link.href} href={link.href}>
              {pickLocalized(link.label, locale)}
            </FooterLink>
          ))}
        </FooterColumn>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-6 text-center">
          <p className="font-script text-2xl">{t("brand.footerLine")}</p>
          <p className="text-xs text-white/60">
            © {year} {business.name || t("brand.name")}. {t("footer.rights")}
          </p>
          <p className="mt-1 text-xs text-white/60">Website Made And maintance By Inbora Studio</p>
        </div>
      </div>
    </footer>
  );
}

/**
 * A link group: a plain column from sm up; on phones a closed accordion, so
 * the footer is a few rows instead of two screens. Only one of the two is
 * ever displayed, so screen readers and tests see each link once.
 */
function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <details className="group border-b border-white/10 sm:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold tracking-wide uppercase focus-visible:ring-[3px] focus-visible:ring-white/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <h2 className="!text-white">{title}</h2>
          <ChevronDown
            className="size-5 shrink-0 text-white/70 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <ul className="grid grid-cols-2 gap-x-4 pb-3">{children}</ul>
      </details>
      <div className="max-sm:hidden">
        <h2 className="mb-3 text-sm font-semibold tracking-wide !text-white uppercase">{title}</h2>
        <ul className="space-y-1">{children}</ul>
      </div>
    </>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("https://");
  return (
    <li>
      {external ? (
        <a
          href={href}
          className="inline-flex min-h-11 items-center text-sm text-white/75 hover:text-white sm:min-h-9"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ) : (
        <Link
          href={href}
          className="inline-flex min-h-11 items-center text-sm text-white/75 hover:text-white sm:min-h-9"
        >
          {children}
        </Link>
      )}
    </li>
  );
}
