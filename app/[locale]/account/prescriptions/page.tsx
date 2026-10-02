import { ChevronRight, FileText, Upload } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PrescriptionStatusBadge } from "@/components/delivery/status-badges";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { formatIndiaDateTime } from "@/lib/cabs/ui";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("medicine.account");
  return { title: t("title"), robots: { index: false } };
}

/** The customer's prescriptions, newest first (read through RLS: own rows only). */
export default async function PrescriptionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser("/account/prescriptions");
  const t = await getTranslations("medicine.account");
  const supabase = await createClient();
  const { data } = await supabase
    .from("prescriptions")
    .select("id, patient_name, status, files, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
        <Button asChild>
          <Link href="/medicine">
            <Upload /> {t("uploadNew")}
          </Link>
        </Button>
      </div>
      {rows.length ? (
        <ul className="grid gap-3">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                href={`/account/prescriptions/${p.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 transition hover:shadow-md"
              >
                <div className="min-w-0 space-y-1">
                  <PrescriptionStatusBadge status={p.status} />
                  <p className="flex items-center gap-1.5 truncate font-bold">
                    <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate">{t("forPatient", { name: p.patient_name })}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatIndiaDateTime(p.created_at, locale, true)} ·{" "}
                    {t("fileCount", { count: p.files.length })}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={FileText}
          title={t("empty")}
          description={t("emptyBody")}
          action={
            <Button asChild>
              <Link href="/medicine">{t("uploadNew")}</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
