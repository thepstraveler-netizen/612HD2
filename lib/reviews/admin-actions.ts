"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import type { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/session";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderateReviewSchema, replyReviewSchema } from "@/schemas/reviews";
import { notifyReviewPublished } from "./notify";
import { REVIEWS_TAG } from "./queries";
import { reviewErrorKey } from "./ui";

/**
 * Staff actions in Admin → Reviews. Each checks reviews.write on the server,
 * validates with the shared schema and calls a service-role SQL function
 * with the staff member as `p_actor`, so the audit log records who did it.
 * Errors are message keys under `reviewsAdmin.errors`.
 */

export type ReviewActionResult = { ok: true } | { ok: false; error: string; field?: string };

async function staffAction<S extends z.ZodType>(
  schema: S,
  input: unknown,
  run: (data: z.output<S>, session: SessionContext) => Promise<ReviewActionResult>,
): Promise<ReviewActionResult> {
  let session: SessionContext;
  try {
    session = await assertPermission("reviews.write");
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
    if (result.ok) {
      revalidatePath("/[locale]/admin/reviews", "layout");
      revalidatePath("/[locale]/account/trips", "layout");
      revalidateTag(REVIEWS_TAG);
    }
    return result;
  } catch (error) {
    console.error("[reviews admin] action failed", error);
    return { ok: false, error: "actionFailed" };
  }
}

function dbError(error: { message: string }): ReviewActionResult {
  const key = reviewErrorKey(error.message);
  if (!key) console.error("[reviews admin] database error", error);
  return { ok: false, error: key ?? "actionFailed" };
}

/** Publishes, or rejects with a note the customer sees. Publishing emails the author once. */
export async function moderateReview(input: unknown): Promise<ReviewActionResult> {
  return staffAction(moderateReviewSchema, input, async (data, session) => {
    const admin = createAdminClient();
    const { data: before } = await admin.from("reviews").select("status").eq("id", data.id).maybeSingle();
    if (!before) return { ok: false, error: "notFound" };
    const { data: review, error } = await admin.rpc("moderate_review", {
      p_id: data.id,
      p_status: data.status,
      p_note: data.note || null,
      p_actor: session.user.id,
    });
    if (error) return dbError(error);
    // Ratings on hotels, packages and stores are cached with the catalog.
    if (before.status === "published" || review.status === "published") revalidateTag(CATALOG_TAG);
    if (review.status === "published" && before.status !== "published") await notifyReviewPublished(review);
    return { ok: true };
  });
}

/** Sets, edits or (when empty) removes the public reply. */
export async function replyToReview(input: unknown): Promise<ReviewActionResult> {
  return staffAction(replyReviewSchema, input, async (data, session) => {
    const { error } = await createAdminClient().rpc("reply_review", {
      p_id: data.id,
      p_reply: data.reply || null,
      p_actor: session.user.id,
    });
    if (error) return dbError(error);
    return { ok: true };
  });
}
