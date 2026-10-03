"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type { MutationResult } from "@/lib/admin/mutate";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  adjustPointsSchema,
  customerBlockSchema,
  customerNoteDeleteSchema,
  customerNoteSchema,
} from "@/schemas/engagement-admin";
import { adjustPointsError } from "./rows";

/**
 * Admin → Customers mutations, all needing customers.write. Notes and
 * blocking write as the signed-in staff member (RLS + the profiles guard
 * apply and the audit log names them). Points go through the service-role
 * adjust_points function with the staff member as p_actor, which records
 * them in the ledger and the audit log.
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

function refresh(userId: string) {
  revalidatePath(`/[locale]/admin/customers/${userId}`, "page");
  revalidatePath("/[locale]/admin/customers", "page");
}

export async function adjustCustomerPoints(input: unknown): Promise<MutationResult> {
  const r = await authorise(adjustPointsSchema, input);
  if ("error" in r) return r.error;
  const { data, error } = await createAdminClient().rpc("adjust_points", {
    p_user: r.data.user_id,
    p_points: r.data.points,
    p_note: r.data.note,
    p_actor: r.session.user.id,
  });
  if (error) {
    const code = adjustPointsError(error.message);
    if (code) return { ok: false, error: code, field: code === "reason_required" ? "note" : "points" };
    console.error("[customers admin] adjust points failed", error);
    return { ok: false, error: "saveFailed" };
  }
  refresh(r.data.user_id);
  return { ok: true, id: data };
}

export async function addCustomerNote(input: unknown): Promise<MutationResult> {
  const r = await authorise(customerNoteSchema, input);
  if ("error" in r) return r.error;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_notes")
    .insert({ user_id: r.data.user_id, body: r.data.body, created_by: r.session.user.id })
    .select("id")
    .single();
  if (error) {
    console.error("[customers admin] add note failed", error);
    return { ok: false, error: "saveFailed" };
  }
  refresh(r.data.user_id);
  return { ok: true, id: data.id };
}

export async function deleteCustomerNote(input: unknown): Promise<MutationResult> {
  const r = await authorise(customerNoteDeleteSchema, input);
  if ("error" in r) return r.error;
  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_notes")
    .delete()
    .eq("id", r.data.id)
    .eq("user_id", r.data.user_id);
  if (error) {
    console.error("[customers admin] delete note failed", error);
    return { ok: false, error: "saveFailed" };
  }
  refresh(r.data.user_id);
  return { ok: true };
}

/** Blocks or unblocks a customer. Staff cannot block themselves. */
export async function setCustomerBlocked(input: unknown): Promise<MutationResult> {
  const r = await authorise(customerBlockSchema, input);
  if ("error" in r) return r.error;
  if (r.data.blocked && r.data.user_id === r.session.user.id) return { ok: false, error: "selfBlock" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_blocked: r.data.blocked })
    .eq("id", r.data.user_id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[customers admin] block failed", error);
    return { ok: false, error: "saveFailed" };
  }
  if (!data) return { ok: false, error: "notFound" };
  refresh(r.data.user_id);
  return { ok: true };
}
