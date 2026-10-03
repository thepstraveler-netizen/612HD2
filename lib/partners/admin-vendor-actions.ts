"use server";

import { mutate } from "@/lib/admin/mutate";
import { vendorAdminSchema } from "@/schemas/vendor-admin";
import { nextFreeSlug, vendorSlugBase, vendorUpdateRow } from "./admin-rows";

/**
 * Staff edits to a vendor (Admin → Vendors), through {@link mutate}:
 * vendors.write checked on the server, zod, an RLS write as the staff user
 * (the audit trigger records who changed what) and the caches cleared.
 * Without an id it creates a vendor directly (calling-centre onboarding);
 * the slug is derived from the name like approval does in SQL.
 */

const notFound = { message: "notFound", code: "notFound" };

export async function saveVendor(input: unknown) {
  return mutate("vendors.write", vendorAdminSchema, input, async (form, supabase) => {
    const row = vendorUpdateRow(form);
    if (form.id) {
      const { data, error } = await supabase
        .from("vendors")
        .update(row)
        .eq("id", form.id)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (error) return { error };
      return data ? { id: data.id } : { error: notFound };
    }
    const base = vendorSlugBase(form.name);
    const { data: taken, error: slugError } = await supabase
      .from("vendors")
      .select("slug")
      .like("slug", `${base}%`);
    if (slugError) return { error: slugError };
    const { data, error } = await supabase
      .from("vendors")
      .insert({
        ...row,
        kind: form.kind,
        slug: nextFreeSlug(
          base,
          taken.map((t) => t.slug),
        ),
      })
      .select("id")
      .single();
    if (error) return { error };
    return { id: data.id };
  });
}
