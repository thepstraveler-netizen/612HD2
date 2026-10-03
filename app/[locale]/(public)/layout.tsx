import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { VisitTracker } from "@/components/leads/attribution";
import { MaintenanceBanner } from "@/components/security/maintenance-banner";
import { MaintenancePage } from "@/components/security/maintenance-page";
import { getMaintenanceState } from "@/lib/security/maintenance";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  // Maintenance mode (D-099): a cached flag read, so static pages stay static.
  const maintenance = await getMaintenanceState();
  if (maintenance === "closed") return <MaintenancePage />;

  return (
    <div className="flex min-h-dvh flex-col">
      {maintenance === "preview" ? <MaintenanceBanner /> : null}
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <VisitTracker />
    </div>
  );
}
