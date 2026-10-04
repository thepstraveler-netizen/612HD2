import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AccountNav } from "@/components/account/account-nav";
import { ReferralClaimer } from "@/components/account/referral-claimer";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { requireUser } from "@/lib/auth/guards";
import { REF_COOKIE } from "@/lib/referrals/link";

/** Per-user content: never prerender. */
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  await requireUser("/account");
  const pendingReferral = (await cookies()).has(REF_COOKIE);
  return (
    // Bottom room on phones for the account tab bar (about 64px plus the safe area).
    <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      <SiteHeader />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8 md:py-8">
        <aside className="md:sticky md:top-20 md:self-start">
          <AccountNav />
        </aside>
        <main id="main" className="min-w-0 py-4 md:py-0">
          {children}
        </main>
      </div>
      {pendingReferral ? <ReferralClaimer /> : null}
      <SiteFooter />
    </div>
  );
}
