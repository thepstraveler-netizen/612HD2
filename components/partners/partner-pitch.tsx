import { Check, MapPin, Megaphone, Share2, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { HomeSection } from "@/lib/catalog/types";
import { pickLocalized } from "@/lib/i18n/localized";
import { getIcon } from "@/lib/icons";
import { sectionContentSchemas } from "@/schemas/cms";
import type { PartnerBusinessType } from "@/schemas/partners";

const FALLBACK_POINTS: { key: string; icon: LucideIcon }[] = [
  { key: "local", icon: MapPin },
  { key: "platform", icon: Share2 },
  { key: "leads", icon: Users },
  { key: "marketing", icon: Megaphone },
  { key: "trust", icon: ShieldCheck },
];

/**
 * "Why collaborate" block of the Partner With Us page. Uses the home page's
 * CMS `why_collaborate` section when there is one (so staff edit it in one
 * place), else the built-in points and the business types from settings.
 */
export async function PartnerPitch({
  section,
  businessTypes,
  locale,
}: {
  section: HomeSection | undefined;
  businessTypes: readonly PartnerBusinessType[];
  locale: string;
}) {
  const t = await getTranslations("partner");
  const content = section ? sectionContentSchemas.why_collaborate.safeParse(section.content) : null;
  const cms = content?.success && content.data.points.length > 0 ? content.data : null;
  const title = section?.title && cms ? pickLocalized(section.title, locale) : t("pitch.title");

  const types = cms?.partner_types.length
    ? cms.partner_types.map((p) => pickLocalized(p, locale))
    : businessTypes.map((type) => t(`types.${type}.name`));
  const points = cms
    ? cms.points.map((p) => ({ icon: getIcon(p.icon), text: pickLocalized(p.text, locale) }))
    : FALLBACK_POINTS.map((p) => ({ icon: p.icon, text: t(`pitch.points.${p.key}`) }));
  const how = ["details", "documents", "agreement", "review"] as const;

  return (
    <section aria-labelledby="partner-why" className="space-y-6">
      <h2 id="partner-why" className="text-xl font-bold sm:text-2xl">
        {title}
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        <ul className="grid gap-3">
          {points.map(({ icon: Icon, text }, i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy text-white">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium">{text}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h3 className="mb-3 font-semibold">{t("pitch.openTo")}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
              {types.map((type, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 shrink-0 text-accent-green" aria-hidden="true" />
                  {type}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h3 className="mb-3 font-semibold">{t("pitch.howTitle")}</h3>
            <ol className="grid gap-3">
              {how.map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-sm">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="pt-1">{t(`pitch.how.${step}`)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
