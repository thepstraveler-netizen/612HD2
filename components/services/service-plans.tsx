import { Check, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { planPrice, type ServicePlan } from "@/lib/catalog/b2b-ui";
import { pickLocalized } from "@/lib/i18n/localized";
import { cn } from "@/lib/utils";
import { ChoosePlanButton } from "./choose-plan-button";

/** Pricing cards of a B2B service page; "Choose this plan" preselects it in the enquiry form. */
export async function ServicePlans({
  plans,
  locale,
  enquiryId,
  accentText,
}: {
  plans: ServicePlan[];
  locale: string;
  /** id of the enquiry section the buttons jump to (null = no form on this page). */
  enquiryId: string | null;
  accentText: string;
}) {
  const t = await getTranslations("servicePage.plans");
  return (
    <section aria-labelledby="service-plans" className="space-y-4">
      <div>
        <h2 id="service-plans" className="text-xl font-bold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>
      </div>
      <ul className={cn("grid gap-4", plans.length > 1 && "sm:grid-cols-2")}>
        {plans.map((plan) => {
          const name = pickLocalized(plan.name, locale);
          const price = planPrice(plan.pricePaise, locale);
          const suffix = plan.priceSuffix ? pickLocalized(plan.priceSuffix, locale) : "";
          return (
            <li
              key={plan.id}
              className={cn(
                "relative flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm",
                plan.isPopular && "border-primary ring-2 ring-primary/20",
              )}
            >
              {plan.isPopular ? (
                <span className="absolute start-5 -top-3 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  <Sparkles className="size-3.5" aria-hidden="true" /> {t("popular")}
                </span>
              ) : null}
              <div className="space-y-1">
                <h3 className="text-lg font-bold">{name}</h3>
                {plan.summary ? (
                  <p className="text-sm text-muted-foreground">{pickLocalized(plan.summary, locale)}</p>
                ) : null}
              </div>
              <p className="flex flex-wrap items-baseline gap-x-1.5">
                {price ? (
                  <>
                    <span className="text-2xl font-extrabold tabular-nums">{price}</span>
                    {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
                  </>
                ) : (
                  <span className="text-lg font-bold">{t("onRequest")}</span>
                )}
              </p>
              {plan.features.length ? (
                <ul className="flex-1 space-y-2 text-sm">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className={cn("mt-0.5 size-4 shrink-0", accentText)} aria-hidden="true" />
                      {pickLocalized(feature, locale)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex-1" />
              )}
              {enquiryId ? (
                <ChoosePlanButton
                  planId={plan.id}
                  targetId={enquiryId}
                  label={t("choose")}
                  planName={name}
                  highlighted={plan.isPopular}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </section>
  );
}
