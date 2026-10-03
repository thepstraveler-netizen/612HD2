import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { ToneBadge } from "@/components/admin/booking-status";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PaymentSubnav } from "@/components/admin/payment-subnav";
import { PayoutActions } from "@/components/admin/settlement-actions";
import { LedgerTable, NetAmount, SettlementSubnav } from "@/components/admin/settlement-shared";
import {
  BankDetailsFacts,
  DetailCard,
  FactList,
  dayFormatter,
  whenFormatter,
} from "@/components/admin/vendor-shared";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/permissions/check";
import { getPayout } from "@/lib/settlements/admin-queries";
import { payoutStatusTone } from "@/lib/settlements/admin-rows";
import { payoutReference } from "@/lib/settlements/statement";

const BASE = "/admin/payments/settlements";

/** One payout: where to send the money, the rows it settles, mark paid / cancel. */
export default async function PayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await requirePermission("payments.read", `${BASE}/payouts/${id}`);
  const canAct = hasPermission(session.permissions, "payments.refund");
  const [t, locale, day, when, found] = await Promise.all([
    getTranslations("settlementsAdmin"),
    getLocale(),
    dayFormatter(),
    whenFormatter(),
    getPayout(id),
  ]);
  if (!found) notFound();
  const { payout, vendor } = found;
  const person = (userId: string | null) => (userId ? (found.people.get(userId) ?? "–") : "–");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("payouts.detailTitle", { reference: payoutReference(payout.number) })}
        lead={t("payouts.detailLead", { vendor: vendor?.name ?? "–", date: day(payout.period_end) })}
        backHref={`${BASE}/payouts`}
        backLabel={t("payouts.title")}
      >
        <PaymentSubnav active="settlements" />
        <SettlementSubnav active="payouts" />
        <div className="flex flex-wrap items-center gap-3">
          <ToneBadge tone={payoutStatusTone(payout.status)} label={t(`payoutStatus.${payout.status}`)} />
          <NetAmount paise={payout.amount_paise} className="items-start text-lg" />
        </div>
        {canAct && payout.status === "pending" ? (
          <PayoutActions payoutId={payout.id} amountPaise={payout.amount_paise} />
        ) : null}
      </AdminPageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard
          title={payout.amount_paise >= 0 ? t("payouts.sendTo") : t("payouts.collectFrom")}
          action={
            vendor ? (
              <Link href={`${BASE}/vendors/${vendor.id}`} className="text-sm font-medium text-primary">
                {t("payouts.viewLedger")}
              </Link>
            ) : null
          }
        >
          <p className="font-medium">{vendor?.name ?? "–"}</p>
          <BankDetailsFacts bank={vendor?.bank ?? null} full={canAct} />
          {vendor?.phone || vendor?.email ? (
            <p className="text-xs text-muted-foreground">
              {[vendor.phone, vendor.email].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </DetailCard>
        <DetailCard title={t("payouts.summary")}>
          <FactList
            items={[
              { label: t("payouts.entries"), value: String(payout.entries_count) },
              { label: t("payouts.gross"), value: formatPaise(payout.gross_paise, locale) },
              { label: t("payouts.commission"), value: formatPaise(payout.commission_paise, locale) },
              { label: t("payouts.amount"), value: formatPaise(payout.amount_paise, locale) },
              { label: t("payouts.provider"), value: payout.provider },
              {
                label: t("payouts.createdBy"),
                value: `${person(payout.created_by)} · ${when(payout.created_at)}`,
              },
              ...(payout.status === "paid"
                ? [
                    {
                      label: t("payouts.method"),
                      value: payout.method ? t(`methods.${payout.method}`) : "–",
                    },
                    { label: t("payouts.reference"), value: payout.reference },
                    {
                      label: t("payouts.paidBy"),
                      value: `${person(payout.paid_by)} · ${when(payout.paid_at)}`,
                    },
                  ]
                : []),
              ...(payout.status === "cancelled"
                ? [{ label: t("payouts.cancelledAt"), value: when(payout.cancelled_at) }]
                : []),
            ]}
          />
          {payout.notes ? <p className="text-sm whitespace-pre-line">{payout.notes}</p> : null}
        </DetailCard>
      </div>

      <section className="grid gap-3">
        <h2 className="text-base font-semibold">{t("payouts.rows")}</h2>
        {payout.status === "cancelled" ? (
          <p className="text-sm text-muted-foreground">{t("payouts.cancelledRows")}</p>
        ) : (
          <LedgerTable rows={found.rows} totals={found.totals} showPayout={false} />
        )}
      </section>
    </div>
  );
}
