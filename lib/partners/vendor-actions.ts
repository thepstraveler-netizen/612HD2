"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { vendorDocumentSchema, vendorProfileSchema, vendorUploadSchema } from "@/schemas/partners";
import { getPartnersSettings } from "./settings";
import { documentExtension } from "./status";

/**
 * The vendor portal's own business screen: contact, tax and payout details,
 * and documents. The caller must hold `vendor.portal` and be a member of
 * the vendor; the SQL functions check membership again.
 *
 * Errors are message keys under `vendorBusiness.errors`.
 */

export type VendorBusinessResult =
  { ok: true; id?: string; path?: string; token?: string } | { ok: false; error: string; field?: string };

const vendorId = z.object({ vendorId: z.uuid() });

async function portalUser(): Promise<string | null> {
  try {
    return (await assertPermission("vendor.portal")).user.id;
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

async function isMember(vendor: string, user: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("vendor_members")
    .select("user_id")
    .eq("vendor_id", vendor)
    .eq("user_id", user)
    .maybeSingle();
  return Boolean(data);
}

function dbError(error: { message: string }): VendorBusinessResult {
  if (error.message.includes("not_member")) return { ok: false, error: "forbidden" };
  if (error.message.includes("not_found")) return { ok: false, error: "notFound" };
  console.error("[vendor business] database error", error);
  return { ok: false, error: "saveFailed" };
}

export async function updateVendorProfile(input: unknown): Promise<VendorBusinessResult> {
  const user = await portalUser();
  if (!user) return { ok: false, error: "forbidden" };
  const parsed = vendorId.and(vendorProfileSchema).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") };
  }
  const p = parsed.data;
  const { error } = await createAdminClient().rpc("update_vendor_profile", {
    p_vendor_id: p.vendorId,
    p: {
      contact_name: p.contactName,
      phone: p.phone,
      email: p.email,
      address: p.address,
      city: p.city,
      gstin: p.gstin,
      pan: p.pan,
      bank_details: p.bank,
    },
    p_actor: user,
  });
  if (error) return dbError(error);
  revalidatePath("/[locale]/vendor", "layout");
  return { ok: true, id: p.vendorId };
}

/** Step 1 of adding a document: a one-time signed upload URL under vendors/<vendor id>/. */
export async function createVendorUpload(input: unknown): Promise<VendorBusinessResult> {
  const user = await portalUser();
  if (!user) return { ok: false, error: "forbidden" };
  const parsed = vendorId.and(vendorUploadSchema).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message === "tooLarge" ? "tooLarge" : "badFile" };
  }
  if (!(await isMember(parsed.data.vendorId, user))) return { ok: false, error: "forbidden" };
  const settings = await getPartnersSettings();
  if (parsed.data.size_bytes > settings.max_file_mb * 1024 * 1024) return { ok: false, error: "tooLarge" };
  const path = `vendors/${parsed.data.vendorId}/${crypto.randomUUID()}.${documentExtension(parsed.data.mime_type)}`;
  const { data, error } = await createAdminClient().storage.from("documents").createSignedUploadUrl(path);
  if (error) {
    console.error("[vendor business] signed upload", error);
    return { ok: false, error: "uploadFailed" };
  }
  return { ok: true, path: data.path, token: data.token };
}

/** Step 2: records the uploaded file (pending until staff verify it). */
export async function saveVendorDocument(input: unknown): Promise<VendorBusinessResult> {
  const user = await portalUser();
  if (!user) return { ok: false, error: "forbidden" };
  const parsed = vendorId.and(vendorDocumentSchema).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  if (!d.path.startsWith(`vendors/${d.vendorId}/`)) return { ok: false, error: "invalid" };
  const { data, error } = await createAdminClient().rpc("add_vendor_document", {
    p_vendor_id: d.vendorId,
    p: {
      kind: d.kind,
      path: d.path,
      name: d.name,
      mime_type: d.mime_type,
      size: d.size,
      expires_on: d.expiresOn,
    },
    p_actor: user,
  });
  if (error) return dbError(error);
  revalidatePath("/[locale]/vendor", "layout");
  return { ok: true, id: data };
}
