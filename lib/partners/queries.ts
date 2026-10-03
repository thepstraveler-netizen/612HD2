import "server-only";
import type { SessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus, PartnerBusinessType } from "@/schemas/partners";
import { applicationReference } from "./status";

/**
 * Partner With Us reads. The applicant's own applications come through the
 * signed-in client: RLS lets a user read only their own rows.
 */

export type MyApplication = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  businessType: PartnerBusinessType;
  businessName: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  vendorId: string | null;
};

/** The signed-in user's applications, newest first (at most 10). */
export async function getMyApplications(session: SessionContext): Promise<MyApplication[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_applications")
    .select("id, number, status, business_type, business_name, created_at, reviewed_at, review_note, vendor_id")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    console.error("[partners] my applications", error);
    return [];
  }
  return data.map((a) => ({
    id: a.id,
    reference: applicationReference(a.number),
    status: a.status,
    businessType: a.business_type,
    businessName: a.business_name,
    submittedAt: a.created_at,
    reviewedAt: a.reviewed_at,
    reviewNote: a.review_note,
    vendorId: a.vendor_id,
  }));
}
