import { MapPin, MessageCircle, Phone } from "lucide-react";
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
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
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
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm"
              >
                <Phone className="size-4" aria-hidden="true" /> {t("contact.call")}
              </a>
            ) : null}
            {whatsapp ? (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent-green px-3 text-sm"
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
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold tracking-wide !text-white uppercase">{title}</h2>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("https://");
  return (
    <li>
      {external ? (
        <a
          href={href}
          className="inline-flex min-h-9 items-center text-sm text-white/75 hover:text-white"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ) : (
        <Link href={href} className="inline-flex min-h-9 items-center text-sm text-white/75 hover:text-white">
          {children}
        </Link>
      )}
    </li>
  );
}
