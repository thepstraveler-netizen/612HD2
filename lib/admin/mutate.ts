import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import type { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import type { PermissionKey } from "@/lib/permissions/constants";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared shape of every admin mutation: (1) check the permission server-side,
 * (2) validate input with the shared zod schema, (3) write as the signed-in
 * user so RLS applies too, (4) the audit trigger records the change, and
 * (5) the public catalog cache is revalidated so the site updates at once.
 */

export type MutationResult = { ok: true; id?: string } | { ok: false; error: string; field?: string };

export type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Error codes a `write` callback may return to show a specific message. */
const PASSTHROUGH_CODES = new Set(["invalidJson", "invalidContent", "notFound", "inUse"]);

export async function mutate<S extends z.ZodType>(
  permission: PermissionKey,
  schema: S,
  input: unknown,
  write: (
    data: z.output<S>,
    supabase: Supabase,
  ) => Promise<{ id?: string; error?: { message: string; code?: string } | null }>,
): Promise<MutationResult> {
  try {
    await assertPermission(permission);
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") };
  }
  const supabase = await createClient();
  const { id, error } = await write(parsed.data, supabase);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "duplicate" };
    if (error.code && PASSTHROUGH_CODES.has(error.code)) return { ok: false, error: error.code };
    console.error("[admin] write failed", error);
    return { ok: false, error: "saveFailed" };
  }
  revalidateTag(CATALOG_TAG);
  revalidatePath("/[locale]/admin", "layout");
  return { ok: true, id };
}
