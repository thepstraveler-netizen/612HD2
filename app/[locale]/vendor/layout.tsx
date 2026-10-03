import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { VendorNav } from "@/components/delivery/vendor-nav";
import { PortalShell } from "@/components/layout/portal-shell";
import { requirePermission } from "@/lib/auth/guards";
import { getVendorContext } from "@/lib/delivery/vendor";

/** Per-user content: never prerender. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function VendorLayout({ children }: { children: ReactNode }) {
  await requirePermission("vendor.portal", "/vendor");
  const [t, ctx] = await Promise.all([getTranslations("vendor"), getVendorContext()]);
  const showStores = (ctx?.stores.length ?? 0) > 0;
  return (
    <PortalShell title={t("title")}>
      <Suspense fallback={<div className="-mx-4 mb-4 h-11 border-b" />}>
        <VendorNav showStores={showStores} />
      </Suspense>
      {children}
    </PortalShell>
  );
}
