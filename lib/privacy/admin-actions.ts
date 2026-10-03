"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type { MutationResult } from "@/lib/admin/mutate";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectUserFiles, removeUserFiles } from "./files";
import { completeDeletionSchema, rejectPrivacyRequestSchema } from "@/schemas/privacy";
import { privacyRpcError } from "./rows";

/**
 * Admin → Customers → Privacy requests (customers.write). Completing a
 * deletion deletes the auth user with the service role — which cascades the
 * profile, addresses, travellers, wishlist, points and reviews and keeps
 * bookings and invoices with no account link for tax records. The customer's
 * uploaded files (prescriptions, partner documents, review photos) are
 * removed first (D-109); if that fails nothing is deleted and staff retry.
 * Finally it closes the request with resolve_privacy_request(actor, …), so the audit
 * log names the staff member.
 */

type Parsed<S extends z.ZodType> = { session: SessionContext; data: z.output<S> } | { error: MutationResult };

async function authorise<S extends z.ZodType>(schema: S, input: unknown): Promise<Parsed<S>> {
  let session: SessionContext;
  try {
    session = await assertPermission("customers.write");
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: { ok: false, error: "forbidden" } };
    throw error;
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") } };
  }
  return { session, data: parsed.data };
}

function refresh(userId: string | null) {
  revalidatePath("/[locale]/admin/customers/privacy", "page");
  revalidatePath("/[locale]/admin/customers", "page");
  if (userId) revalidatePath(`/[locale]/admin/customers/${userId}`, "page");
}

async function resolve(actor: string, id: string, status: "completed" | "rejected", note: string) {
  const { error } = await createAdminClient().rpc("resolve_privacy_request", {
    p_actor: actor,
    p_id: id,
    p_status: status,
    p_note: note,
  });
  return error;
}

export async function completeAccountDeletion(input: unknown): Promise<MutationResult> {
  const r = await authorise(completeDeletionSchema, input);
  if ("error" in r) return r.error;
  const db = createAdminClient();
  const { data: request, error } = await db
    .from("privacy_requests")
    .select("id, user_id, kind, status")
    .eq("id", r.data.id)
    .maybeSingle();
  if (error) {
    console.error("[privacy admin] load request", error);
    return { ok: false, error: "saveFailed" };
  }
  if (!request || request.kind !== "delete" || request.status !== "pending") {
    return { ok: false, error: "notFound" };
  }

  // A null user means the account is already gone (an earlier attempt deleted
  // it but could not close the request): just close it.
  if (request.user_id) {
    if (request.user_id === r.session.user.id) return { ok: false, error: "selfDelete" };
    const blockers = await db.rpc("account_deletion_blockers", { p_user: request.user_id });
    if (blockers.error) {
      console.error("[privacy admin] blockers", blockers.error);
      return { ok: false, error: "saveFailed" };
    }
    if ((blockers.data ?? 0) > 0) return { ok: false, error: "openBookings" };
    try {
      await removeUserFiles(db, await collectUserFiles(db, request.user_id));
    } catch (filesError) {
      console.error("[privacy admin] remove files", filesError);
      return { ok: false, error: "filesFailed" };
    }
    const deleted = await db.auth.admin.deleteUser(request.user_id);
    if (deleted.error) {
      console.error("[privacy admin] delete user", deleted.error);
      return { ok: false, error: "deleteFailed" };
    }
  }

  const resolveError = await resolve(r.session.user.id, request.id, "completed", r.data.note);
  if (resolveError) {
    console.error("[privacy admin] close request", resolveError);
    return { ok: false, error: "closeFailed" };
  }
  refresh(request.user_id);
  return { ok: true, id: request.id };
}

export async function rejectPrivacyRequest(input: unknown): Promise<MutationResult> {
  const r = await authorise(rejectPrivacyRequestSchema, input);
  if ("error" in r) return r.error;
  const { data: request } = await createAdminClient()
    .from("privacy_requests")
    .select("user_id")
    .eq("id", r.data.id)
    .maybeSingle();
  const error = await resolve(r.session.user.id, r.data.id, "rejected", r.data.note);
  if (error) {
    const code = privacyRpcError(error.message);
    if (code === "reasonRequired") return { ok: false, error: code, field: "note" };
    if (code === "notFound") return { ok: false, error: code };
    console.error("[privacy admin] reject", error);
    return { ok: false, error: "saveFailed" };
  }
  refresh(request?.user_id ?? null);
  return { ok: true, id: r.data.id };
}
