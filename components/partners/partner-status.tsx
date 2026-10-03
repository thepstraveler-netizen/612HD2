import { CircleCheck, CircleX, Clock, FileSearch } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { MyApplication } from "@/lib/partners/queries";
import { cn } from "@/lib/utils";

const ICONS = {
  submitted: Clock,
  under_review: FileSearch,
  approved: CircleCheck,
  rejected: CircleX,
} as const;

/** Where an application stands, with the next thing the applicant can do. */
export async function PartnerStatus({ application, locale }: { application: MyApplication; locale: string }) {
  const t = await getTranslations("partner");
  const { status } = application;
  const Icon = ICONS[status];
  const date = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(application.submittedAt));
  // 0 received, 1 in review, 2 decided.
  const reached = status === "submitted" ? 0 : status === "under_review" ? 1 : 2;
  const track = ["received", "review", "decision"] as const;

  return (
    <section
      aria-labelledby="partner-status"
      className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
      data-testid="partner-status"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full",
            status === "approved" && "bg-accent-green/15 text-accent-green",
            status === "rejected" && "bg-destructive/10 text-destructive",
            (status === "submitted" || status === "under_review") && "bg-brand-sky text-brand-navy",
          )}
        >
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 id="partner-status" className="text-lg font-bold">
            {t("status.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("status.reference", { reference: application.reference })} · {application.businessName} ·{" "}
            {t(`types.${application.businessType}.name`)}
          </p>
          <p className="text-sm text-muted-foreground">{t("status.submittedOn", { date })}</p>
        </div>
      </div>

      <ol aria-label={t("status.progress")} className="grid grid-cols-3 gap-2">
        {track.map((step, i) => (
          <li key={step} aria-current={i === reached ? "step" : undefined} className="space-y-1.5">
            <span
              className={cn(
                "block h-1.5 rounded-full",
                i <= reached ? (status === "rejected" && i === 2 ? "bg-destructive" : "bg-primary") : "bg-muted",
              )}
            />
            <span className={cn("block text-xs", i <= reached ? "font-semibold" : "text-muted-foreground")}>
              {i === 2 && reached === 2 ? t(`status.labels.${status}`) : t(`status.track.${step}`)}
            </span>
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        <p className="font-semibold">{t(`status.labels.${status}`)}</p>
        <p className="text-sm">{t(`status.bodies.${status}`)}</p>
        {status === "rejected" && application.reviewNote ? (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm">
            {t("status.reason", { reason: application.reviewNote })}
          </p>
        ) : null}
      </div>

      {status === "approved" || status === "rejected" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {status === "approved" ? (
            <>
              <Button asChild size="lg">
                <Link href="/vendor">{t("status.openDashboard")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/partner?apply=1">{t("status.applyAnother")}</Link>
              </Button>
            </>
          ) : (
            <Button asChild size="lg">
              <Link href="/partner?apply=1">{t("status.applyAgain")}</Link>
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
