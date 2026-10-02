import { ChevronRight, Clock, MessageCircle, Moon, Phone, Route, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getIcon } from "@/lib/icons";
import { formatPaise } from "@/lib/money";
import type { RideResultOffer } from "@/lib/rides/page-data";
import { cn } from "@/lib/utils";

export type RideCta =
  | { kind: "book"; query: Record<string, string> }
  | { kind: "enquire"; whatsapp: string | null; phone: string | null; rideText: string };

/** One card per vehicle type with the server's fare (incl. GST) and a Book or enquire button. */
export function RideResults({
  offers,
  cta,
  passengers,
  chosen,
  locale,
}: {
  offers: RideResultOffer[];
  cta: RideCta;
  passengers: number;
  chosen?: string;
  locale: string;
}) {
  const t = useTranslations("rides.results");
  const money = (paise: number) => formatPaise(paise, locale);

  return (
    <ul className="grid gap-3" aria-label={t("listLabel")}>
      {offers.map((o) => {
        const Icon = getIcon(o.icon);
        const enquiry =
          cta.kind === "enquire" ? t("whatsappText", { vehicle: o.name, ride: cta.rideText }) : "";
        return (
          <li
            key={o.key}
            className={cn(
              "grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-[auto_1fr_auto] sm:items-center",
              o.key === chosen && "border-primary ring-1 ring-primary",
              !o.fits && "opacity-75",
            )}
          >
            <span className="hidden size-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground sm:grid">
              <Icon className="size-7" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <Icon className="size-5 text-primary sm:hidden" aria-hidden="true" /> {o.name}
              </h3>
              {o.description ? <p className="text-sm text-muted-foreground">{o.description}</p> : null}
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" aria-hidden="true" /> {t("seats", { count: o.seats })}
                </span>
                {o.includedKm > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Route className="size-3.5" aria-hidden="true" /> {t("includedKm", { km: o.includedKm })}
                  </span>
                ) : null}
                {o.freeWaitingMinutes > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden="true" />{" "}
                    {t("freeWaiting", { minutes: o.freeWaitingMinutes })}
                  </span>
                ) : null}
                {o.night ? (
                  <span className="inline-flex items-center gap-1">
                    <Moon className="size-3.5" aria-hidden="true" /> {t("nightIncluded")}
                  </span>
                ) : null}
              </p>
              {!o.instantBook ? (
                <p className="text-xs font-medium text-accent-orange">{t("onRequest")}</p>
              ) : null}
              {!o.fits ? (
                <p className="text-xs font-medium text-destructive">{t("tooSmall", { count: passengers })}</p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
              <div className="sm:text-right">
                <p className="text-xs text-muted-foreground">{t("from")}</p>
                <p className="text-2xl font-extrabold">{money(o.totalPaise)}</p>
                <p className="text-xs text-muted-foreground">{t("inclGst")}</p>
              </div>
              {cta.kind === "book" ? (
                o.fits ? (
                  <Button asChild size="lg">
                    <Link
                      href={{ pathname: "/rides/review", query: { ...cta.query, v: o.key } }}
                      aria-label={t("bookAria", { vehicle: o.name })}
                    >
                      {t("book")} <ChevronRight />
                    </Link>
                  </Button>
                ) : (
                  <Button size="lg" disabled>
                    {t("book")}
                  </Button>
                )
              ) : (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {cta.whatsapp ? (
                    <Button asChild size="lg">
                      <a
                        href={`https://wa.me/${cta.whatsapp}?text=${encodeURIComponent(enquiry)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle /> {t("enquire")}
                      </a>
                    </Button>
                  ) : null}
                  {cta.phone ? (
                    <Button asChild size="lg" variant="outline">
                      <a href={`tel:${cta.phone}`} aria-label={t("callAria")}>
                        <Phone /> {t("call")}
                      </a>
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
