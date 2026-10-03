"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { formatPaise } from "@/lib/money";
import { notify } from "@/lib/notifications/service";
import type { PermissionKey } from "@/lib/permissions/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankDetailsSchema } from "@/schemas/partners";
import {
  adjustmentSchema,
  createPayoutSchema,
  markPayoutPaidSchema,
  payoutIdSchema,
} from "@/schemas/settlements";
import { payoutProvider } from "./provider";
import { getSettlementsSettings } from "./settings";
import { payoutReference } from "./statement";

/**
 * Finance actions on vendor settlements (Admin → Payments → Settlements).
 * Creating, paying and cancelling payouts and manual adjustments need
 * `payments.refund` (money leaves the business); every call goes through a
 * service-role SQL function with the staff member as `p_actor`.
 *
 * Errors are message keys under `settlementsAdmin.errors`.
 */

export type SettlementActionResult = { ok: true; id?: string } | { ok: false; error: string; field?: string };

const DB_CODES: [string, string][] = [
  ["nothing_to_settle", "nothingToSettle"],
  ["payout_pending", "payoutPending"],
  ["invalid_transition", "invalidTransition"],
  ["reason_required", "reasonRequired"],
  ["invalid_amount", "invalidAmount"],
  ["not_found", "notFound"],
];

function errorKey(error: { message: string }): string {
  const hit = DB_CODES.find(([code]) => error.message.includes(code));
  if (!hit) console.error("[settlements] database error", error);
  return hit?.[1] ?? "actionFailed";
}

async function financeAction<S extends z.ZodType>(
  permission: PermissionKey,
  schema: S,
  input: unknown,
  run: (data: z.output<S>, session: SessionContext) => Promise<SettlementActionResult>,
): Promise<SettlementActionResult> {
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
    revalidatePath("/[locale]/admin/payments", "layout");
    revalidatePath("/[locale]/vendor", "layout");
    return result;
  } catch (error) {
    console.error("[settlements] action failed", error);
    return { ok: false, error: "actionFailed" };
  }
}

/** Gathers a vendor's unsettled rows up to a date into a pending payout, and hands it to the payout provider. */
export async function createPayout(input: unknown): Promise<SettlementActionResult> {
  return financeAction("payments.refund", createPayoutSchema, input, async (data, session) => {
    const admin = createAdminClient();
    const { data: payout, error } = await admin.rpc("create_vendor_payout", {
      p_vendor_id: data.vendorId,
      p_period_end: data.periodEnd,
      p_actor: session.user.id,
    });
    if (error) return { ok: false, error: errorKey(error) };

    const provider = payoutProvider((await getSettlementsSettings()).provider);
    if (provider.automatic && payout.amount_paise > 0) {
      const { data: vendor } = await admin
        .from("vendors")
        .select("name, bank_details")
        .eq("id", data.vendorId)
        .single();
      const bank = bankDetailsSchema.safeParse(vendor?.bank_details ?? {});
      const sent = await provider.send({
        payoutId: payout.id,
        vendorName: vendor?.name ?? "",
        amountPaise: payout.amount_paise,
        bank: bank.success ? bank.data : null,
      });
      if (sent.status === "sent") {
        await markPaid(payout.id, "bank_transfer", sent.reference, "", session.user.id);
      }
    }
    return { ok: true, id: payout.id };
  });
}

async function markPaid(id: string, method: string, reference: string, notes: string, actor: string) {
  const admin = createAdminClient();
  const { data: payout, error } = await admin.rpc("mark_vendor_payout_paid", {
    p_id: id,
    p_method: method,
    p_reference: reference || null,
    p_notes: notes || null,
    p_actor: actor,
  });
  if (error) return { error };
  const { data: vendor } = await admin
    .from("vendors")
    .select("name, contact_name, email, phone")
    .eq("id", payout.vendor_id)
    .single();
  if (vendor) {
    await notify({
      key: "payout.paid",
      locale: "en",
      to: { email: vendor.email, phone: vendor.phone, userId: null },
      values: {
        name: vendor.contact_name ?? vendor.name,
        business: vendor.name,
        reference: payoutReference(payout.number),
        amount: formatPaise(payout.amount_paise, "en"),
        period_end: payout.period_end,
        method: method.replace("_", " "),
        payment_reference: reference,
        dashboard_url: `${publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/vendor/earnings`,
      },
    });
  }
  return { payout };
}

/** Records that a pending payout was paid (or collected, when the vendor owed money). */
export async function markPayoutPaid(input: unknown): Promise<SettlementActionResult> {
  return financeAction("payments.refund", markPayoutPaidSchema, input, async (data, session) => {
    const { error } = await markPaid(data.id, data.method, data.reference, data.notes, session.user.id);
    if (error) return { ok: false, error: errorKey(error) };
    return { ok: true, id: data.id };
  });
}

/** Cancels a pending payout; its rows become unsettled again. */
export async function cancelPayout(input: unknown): Promise<SettlementActionResult> {
  return financeAction("payments.refund", payoutIdSchema, input, async (data, session) => {
    const { error } = await createAdminClient().rpc("cancel_vendor_payout", {
      p_id: data.id,
      p_actor: session.user.id,
    });
    if (error) return { ok: false, error: errorKey(error) };
    return { ok: true, id: data.id };
  });
}

/** A manual credit or debit on a vendor's ledger. */
export async function addAdjustment(input: unknown): Promise<SettlementActionResult> {
  return financeAction("payments.refund", adjustmentSchema, input, async (data, session) => {
    const { data: id, error } = await createAdminClient().rpc("add_vendor_adjustment", {
      p_vendor_id: data.vendorId,
      p_amount: data.direction === "credit" ? data.amount : -data.amount,
      p_note: data.note,
      p_actor: session.user.id,
    });
    if (error) return { ok: false, error: errorKey(error) };
    return { ok: true, id };
  });
}
