import { Download, KeyRound, ShieldAlert, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { MfaManager } from "@/components/mfa/mfa-manager";
import { DataExportButton } from "@/components/privacy/data-export-button";
import { DeleteAccountCard } from "@/components/privacy/delete-account-card";
import { requireUser } from "@/lib/auth/guards";
import { getAssuranceLevel } from "@/lib/mfa/server";
import { verifiedTotpFactors } from "@/lib/mfa/policy";
import { getOwnPrivacyOverview } from "@/lib/privacy/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return { title: t("title"), robots: { index: false } };
}

function Section({
  icon,
  title,
  lead,
  children,
}: {
  icon: ReactNode;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
          {icon}
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{lead}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Account → Privacy & security: two-step sign-in, download my data, delete my account. */
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ mfa?: string }> }) {
  const session = await requireUser("/account/security");
  const { mfa } = await searchParams;
  const [t, format, overview, level] = await Promise.all([
    getTranslations("privacy"),
    getFormatter(),
    getOwnPrivacyOverview(session.user.id),
    getAssuranceLevel(),
  ]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });
  const factors = verifiedTotpFactors(session.user.factors).map((f, i) => ({
    id: f.id,
    name: f.friendly_name || t("authenticatorN", { n: i + 1 }),
    addedOn: date(f.created_at),
  }));
  // Supabase only lets an aal2 session add to or remove verified factors.
  const canManage = factors.length === 0 || level === "aal2";
  const pending = overview.pendingDeletion;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>

      {mfa === "required" && factors.length === 0 ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("mfaRequired")}
        </p>
      ) : null}

      <Section icon={<KeyRound className="size-5" />} title={t("mfaTitle")} lead={t("mfaLead")}>
        <MfaManager factors={factors} canManage={canManage} />
      </Section>

      <Section icon={<Download className="size-5" />} title={t("exportTitle")} lead={t("exportLead")}>
        <div className="flex flex-wrap items-center gap-3">
          <DataExportButton />
          {overview.lastExportAt ? (
            <span className="text-sm text-muted-foreground">
              {t("lastExport", { date: date(overview.lastExportAt) })}
            </span>
          ) : null}
        </div>
      </Section>

      <Section icon={<Trash2 className="size-5" />} title={t("deleteTitle")} lead={t("deleteLead")}>
        <DeleteAccountCard
          blockers={overview.blockers}
          pending={pending ? { createdAt: pending.created_at, reason: pending.reason } : null}
          requestedOn={pending ? date(pending.created_at) : null}
        />
      </Section>
    </div>
  );
}
