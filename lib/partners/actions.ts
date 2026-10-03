"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { hasServiceRole } from "@/lib/env.server";
import { notify } from "@/lib/notifications/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { partnerApplicationSchema, partnerUploadSchema } from "@/schemas/partners";
import { getPartnersSettings } from "./settings";
import { applicationReference, documentExtension, missingDocuments } from "./status";

/**
 * Partner With Us (public, signed in). The applicant uploads each document
 * straight to the private `documents` bucket with a one-time signed URL
 * (step 3), then sends the whole application once (step 4). The account
 * that applies becomes the vendor's owner on approval.
 */

export type PartnerUploadResult =
  | { ok: true; path: string; token: string }
  | { ok: false; error: "signIn" | "badFile" | "tooLarge" | "unavailable" | "uploadFailed" };

export type PartnerApplyResult =
  | { ok: true; reference: string }
  | {
      ok: false;
      error: "signIn" | "invalid" | "missingDocuments" | "applicationOpen" | "unavailable" | "unknown";
      field?: string;
      missing?: string[];
    };

export async function createPartnerUpload(input: unknown): Promise<PartnerUploadResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signIn" };
  if (!hasServiceRole()) return { ok: false, error: "unavailable" };
  const parsed = partnerUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message === "tooLarge" ? "tooLarge" : "badFile" };
  }
  const settings = await getPartnersSettings();
  if (parsed.data.size_bytes > settings.max_file_mb * 1024 * 1024) return { ok: false, error: "tooLarge" };
  const path = `partners/${session.user.id}/${crypto.randomUUID()}.${documentExtension(parsed.data.mime_type)}`;
  const { data, error } = await createAdminClient().storage.from("documents").createSignedUploadUrl(path);
  if (error) {
    console.error("[partners] signed upload", error);
    return { ok: false, error: "uploadFailed" };
  }
  return { ok: true, path: data.path, token: data.token };
}

const createdSchema = z.object({ id: z.uuid(), number: z.number() });

export async function submitPartnerApplication(input: unknown): Promise<PartnerApplyResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signIn" };
  const parsed = partnerApplicationSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: "invalid", field: issue?.path.join(".") };
  }
  if (!hasServiceRole()) return { ok: false, error: "unavailable" };
  const a = parsed.data;
  const settings = await getPartnersSettings();

  if (!settings.business_types.includes(a.businessType))
    return { ok: false, error: "invalid", field: "businessType" };
  if (a.agreementVersion !== settings.agreement.version) {
    // The agreement changed while the form was open; the form reloads it.
    return { ok: false, error: "invalid", field: "agreementVersion" };
  }
  // Files must be ones this user uploaded through createPartnerUpload.
  if (a.documents.some((d) => !d.path.startsWith(`partners/${session.user.id}/`))) {
    return { ok: false, error: "invalid", field: "documents" };
  }
  const missing = missingDocuments(settings, a.businessType, a.documents);
  if (missing.length) return { ok: false, error: "missingDocuments", missing };

  const { data, error } = await createAdminClient().rpc("submit_partner_application", {
    p: {
      user_id: session.user.id,
      business_type: a.businessType,
      business_name: a.businessName,
      contact_name: a.contactName,
      phone: a.phone,
      email: a.email,
      city: a.city,
      address: a.address,
      gstin: a.gstin || null,
      pan: a.pan || null,
      website: a.website || null,
      details: a.details,
      message: a.message || null,
      documents: a.documents,
      agreement_version: a.agreementVersion,
      agreement_name: a.agreementName,
      locale: a.locale,
    },
  });
  if (error) {
    if (error.message.includes("application_open")) return { ok: false, error: "applicationOpen" };
    console.error("[partners] submit failed", error);
    return { ok: false, error: "unknown" };
  }
  const created = createdSchema.parse(data);
  const reference = applicationReference(created.number);
  await notify({
    key: "partner.application_received",
    locale: a.locale,
    to: { email: a.email, phone: a.phone, userId: session.user.id },
    values: { name: a.contactName, reference, business: a.businessName },
  });
  return { ok: true, reference };
}
