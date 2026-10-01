import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { requirePermission } from "@/lib/auth/guards";

/** Per-user content: never prerender. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DriverLayout({ children }: { children: ReactNode }) {
  await requirePermission("driver.portal", "/driver");
  const t = await getTranslations("driver");
  return <PortalShell title={t("title")}>{children}</PortalShell>;
}
