"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import type { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/session";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { publicEnv } from "@/lib/env";
import { notify } from "@/lib/notifications/service";
import type { PermissionKey } from "@/lib/permissions/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  approveApplicationSchema,
  reviewApplicationSchema,
  vendorDocumentReviewSchema,
} from "@/schemas/partners";
import { applicationReference } from "./status";

/**
 * Staff actions on partner applications and vendor documents (Admin →
 * Vendors). Each checks the permission on the server, validates with the
 * shared schema and calls a service-role SQL function with the staff member
 * as `p_actor`, so the audit log records who did it.
 *
 * Errors are message keys under `vendorsAdmin.errors`.
 */

export type PartnerActionResult = { ok: true; id?: string } | { ok: false; error: string; field?: string };

const DB_CODES: [string, string][] = [
  ["invalid_transition", "invalidTransition"],
  ["reason_required", "reasonRequired"],
  ["invalid_commission", "invalidCommission"],
  ["not_found", "notFound"],
];

function errorKey(error: { message: string }): string {
  const hit = DB_CODES.find(([code]) => error.message.includes(code));
  if (!hit) console.error("[vendors admin] database error", error);
  return hit?.[1] ?? "actionFailed";
}

async function staffAction<S extends z.ZodType>(
  permission: PermissionKey,
  schema: S,
  input: unknown,
  run: (data: z.output<S>, session: SessionContext) => Promise<PartnerActionResult>,
): Promise<PartnerActionResult> {
  let session: SessionContext;
  try {
    session = await assertPermission(permission);
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") };
  }
  try {
    const result = await run(parsed.data, session);
    revalidatePath("/[locale]/admin/vendors", "layout");
    return result;
  } catch (error) {
    console.error("[vendors admin] action failed", error);
    return { ok: false, error: "actionFailed" };
  }
}

const site = () => publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

/** Marks an application under review, or rejects it with a reason (the applicant is told why). */
export async function reviewApplication(input: unknown): Promise<PartnerActionResult> {
  return staffAction("vendors.write", reviewApplicationSchema, input, async (data, session) => {
    const { data: app, error } = await createAdminClient().rpc("review_partner_application", {
      p_id: data.id,
      p_status: data.status,
      p_note: data.note || null,
      p_actor: session.user.id,
    });
    if (error) return { ok: false, error: errorKey(error) };
    if (data.status === "rejected") {
      await notify({
        key: "partner.application_rejected",
        locale: app.locale,
        to: { email: app.email, phone: app.phone, userId: app.user_id },
        values: {
          name: app.contact_name,
          reference: applicationReference(app.number),
          business: app.business_name,
          reason: data.note,
        },
      });
    }
    return { ok: true, id: app.id };
  });
}

/** Approves an application: the vendor is created and the applicant gets their partner dashboard. */
export async function approveApplication(input: unknown): Promise<PartnerActionResult> {
  return staffAction("vendors.write", approveApplicationSchema, input, async (data, session) => {
    const admin = createAdminClient();
    const { data: vendorId, error } = await admin.rpc("approve_partner_application", {
      p_id: data.id,
      p_commission_bps: data.commissionPercent,
      p_actor: session.user.id,
    });
    if (error) return { ok: false, error: errorKey(error) };
    const { data: app } = await admin
      .from("partner_applications")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (app) {
      await notify({
        key: "partner.application_approved",
        locale: app.locale,
        to: { email: app.email, phone: app.phone, userId: app.user_id },
        values: {
          name: app.contact_name,
          reference: applicationReference(app.number),
          business: app.business_name,
          dashboard_url: `${site()}${app.locale === "hi" ? "/hi" : ""}/vendor`,
        },
      });
    }
    revalidateTag(CATALOG_TAG);
    return { ok: true, id: vendorId };
  });
}

/** Verifies or rejects one vendor document. */
export async function reviewVendorDocument(input: unknown): Promise<PartnerActionResult> {
  return staffAction("vendors.write", vendorDocumentReviewSchema, input, async (data, session) => {
    // The signed-in staff client, so RLS applies and the audit log records the user.
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("vendor_documents")
      .update({
        status: data.status,
        note: data.note || null,
        verified_by: data.status === "pending" ? null : session.user.id,
        verified_at: data.status === "pending" ? null : new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: errorKey(error) };
    if (!row) return { ok: false, error: "notFound" };
    return { ok: true, id: row.id };
  });
}
