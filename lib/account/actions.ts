"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { idSchema, profileSchema, travellerWithIdSchema } from "@/schemas/account";

/**
 * Profile and saved-traveller writes. They run as the signed-in user, so RLS
 * (own rows only) and the profile guard trigger decide what may change.
 */

export type AccountResult =
  { ok: true; id?: string } | { ok: false; error: "signin" | "invalid" | "unknown" };

const refresh = () => revalidatePath("/[locale]/account", "layout");

export async function updateProfile(input: unknown): Promise<AccountResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      preferred_locale: parsed.data.preferredLocale,
    })
    .eq("id", session.user.id);
  if (error) {
    console.error("[account] profile", error);
    return { ok: false, error: "unknown" };
  }
  refresh();
  return { ok: true };
}

export async function saveTraveller(input: unknown): Promise<AccountResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = travellerWithIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { id, ...t } = parsed.data;
  const supabase = await createClient();
  if (t.isDefault) {
    await supabase.from("travellers").update({ is_default: false }).eq("user_id", session.user.id);
  }
  const row = {
    full_name: t.fullName,
    relation: t.relation,
    date_of_birth: t.dateOfBirth,
    gender: t.gender,
    phone: t.phone,
    is_default: t.isDefault,
  };
  const res = id
    ? await supabase.from("travellers").update(row).eq("id", id).select("id").single()
    : await supabase.from("travellers").insert(row).select("id").single();
  if (res.error) {
    console.error("[account] traveller", res.error);
    return { ok: false, error: "unknown" };
  }
  refresh();
  return { ok: true, id: res.data.id };
}

export async function deleteTraveller(input: unknown): Promise<AccountResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.from("travellers").delete().eq("id", parsed.data.id);
  if (error) return { ok: false, error: "unknown" };
  refresh();
  return { ok: true };
}

export async function setDefaultTraveller(input: unknown): Promise<AccountResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signin" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  await supabase.from("travellers").update({ is_default: false }).eq("user_id", session.user.id);
  const { error } = await supabase.from("travellers").update({ is_default: true }).eq("id", parsed.data.id);
  if (error) return { ok: false, error: "unknown" };
  refresh();
  return { ok: true };
}
