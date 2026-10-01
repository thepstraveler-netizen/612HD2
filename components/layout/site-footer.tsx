import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { LogoMark } from "@/components/shared/logo";
import { PeacockFeather, TempleSkyline } from "@/components/shared/motifs";
import { Link } from "@/i18n/navigation";
import { MAIN_NAV } from "@/lib/navigation";
import { SERVICES } from "@/lib/services";

export function SiteFooter() {
  const t = useTranslations();
  const year = new Date().getFullYear();
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
            <MapPin className="size-4" aria-hidden="true" />
            {t("brand.location")} · {t("brand.locationTag")}
          </p>
        </div>
        <FooterColumn title={t("footer.quickLinks")}>
          {MAIN_NAV.slice(0, 6).map((item) => (
            <FooterLink key={item.key} href={item.href}>
              {t(`nav.${item.key}`)}
            </FooterLink>
          ))}
        </FooterColumn>
        <FooterColumn title={t("footer.services")}>
          {SERVICES.slice(0, 6).map((s) => (
            <FooterLink key={s.slug} href={`/services/${s.slug}`}>
              {t(`services.${s.slug}.name`)}
            </FooterLink>
          ))}
        </FooterColumn>
        <FooterColumn title={t("footer.company")}>
          <FooterLink href="/#about">{t("footer.about")}</FooterLink>
          <FooterLink href="/partner">{t("nav.partner")}</FooterLink>
        </FooterColumn>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-6 text-center">
          <p className="font-script text-2xl">{t("brand.footerLine")}</p>
          <p className="text-xs text-white/60">
            © {year} {t("brand.name")}. {t("footer.rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold tracking-wide !text-white uppercase">{title}</h2>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="inline-flex min-h-9 items-center text-sm text-white/75 hover:text-white">
        {children}
      </Link>
    </li>
  );
}
