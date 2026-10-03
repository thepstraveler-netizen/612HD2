import { Download, FileText } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { countOpenApplications } from "@/lib/partners/admin-queries";
import {
  formatBytes,
  isKnownDocumentKind,
  maskAccountNumber,
  type BankDetailsView,
} from "@/lib/partners/admin-rows";
import { AdminSubnav } from "./page-header";

/** Vendors | Applications (n open). */
export async function VendorSubnav({ active }: { active: "vendors" | "applications" }) {
  const [t, open] = await Promise.all([getTranslations("vendorsAdmin.nav"), countOpenApplications()]);
  return (
    <AdminSubnav
      active={active}
      items={[
        { key: "vendors", href: "/admin/vendors", label: t("vendors") },
        {
          key: "applications",
          href: "/admin/vendors/applications",
          label: open ? t("applicationsCount", { count: open }) : t("applications"),
        },
      ]}
    />
  );
}

/** A titled card section on detail pages. */
export function DetailCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label / value pairs; empty values show a dash. */
export function FactList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="font-medium break-words">{item.value || "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Translated label for a document kind (unknown kinds show as stored). */
export async function documentKindLabel(kind: string): Promise<string> {
  const t = await getTranslations("vendorsAdmin.documentKinds");
  return isKnownDocumentKind(kind) ? t(kind) : kind;
}

/** One private document with its short-lived download link. */
export async function DocumentLink({
  kind,
  name,
  size,
  url,
}: {
  kind: string;
  name: string;
  size: number;
  url: string | null;
}) {
  const t = await getTranslations("vendorsAdmin.documents");
  return (
    <div className="flex min-w-0 items-center gap-3">
      <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{await documentKindLabel(kind)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {name}
          {size ? ` · ${formatBytes(size)}` : ""}
        </p>
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent"
        >
          <Download className="size-4" aria-hidden="true" /> {t("download")}
        </a>
      ) : (
        <span className="text-xs text-destructive">{t("missing")}</span>
      )}
    </div>
  );
}

/** Bank / UPI details for payouts; the account number is masked unless `full`. */
export async function BankDetailsFacts({
  bank,
  full = false,
}: {
  bank: BankDetailsView | null;
  full?: boolean;
}) {
  const t = await getTranslations("vendorsAdmin.bank");
  if (!bank) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <FactList
      items={[
        { label: t("holder"), value: bank.holder },
        {
          label: t("account"),
          value: bank.account_number ? (
            <span className="font-mono">
              {full ? bank.account_number : maskAccountNumber(bank.account_number)}
            </span>
          ) : null,
        },
        { label: t("ifsc"), value: bank.ifsc ? <span className="font-mono">{bank.ifsc}</span> : null },
        { label: t("bank"), value: bank.bank },
        { label: t("upi"), value: bank.upi_id ? <span className="font-mono">{bank.upi_id}</span> : null },
      ]}
    />
  );
}

/** "12 Oct 2026, 4:05 pm" in the viewer's locale. */
export async function whenFormatter() {
  const format = await getFormatter();
  return (iso: string | null | undefined) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "–";
}

/** An ISO calendar date shown without zone drift. */
export async function dayFormatter() {
  const format = await getFormatter();
  return (date: string | null | undefined) =>
    date ? format.dateTime(new Date(`${date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) : "–";
}
