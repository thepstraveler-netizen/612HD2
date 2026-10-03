"use server";

import { mutate } from "@/lib/admin/mutate";
import { serviceB2bIdSchema, servicePlanFormSchema, servicePortfolioFormSchema } from "@/schemas/service-b2b";

/**
 * CMS → Services → plans and portfolio. Each goes through {@link mutate}
 * (cms.write checked server-side, zod, an RLS write as the editor, the
 * audit trigger, the catalog cache cleared so the service page updates).
 * Portfolio images are registered with registerMedia (lib/cms/actions).
 */

const notFound = { message: "notFound", code: "notFound" };
/** PostgREST "no rows" for .single(), and Postgres foreign_key_violation. */
const NO_ROWS = "PGRST116";
const FK_VIOLATION = "23503";

export async function saveServicePlan(input: unknown) {
  return mutate("cms.write", servicePlanFormSchema, input, async ({ id, ...row }, supabase) => {
    const { data, error } = id
      ? await supabase
          .from("service_plans")
          .update(row)
          .eq("id", id)
          .eq("service_id", row.service_id)
          .select("id")
          .single()
      : await supabase.from("service_plans").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

export async function deleteServicePlan(input: unknown) {
  return mutate("cms.write", serviceB2bIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("service_plans").delete().eq("id", id)).error,
  }));
}

export async function saveServicePortfolioItem(input: unknown) {
  return mutate("cms.write", servicePortfolioFormSchema, input, async ({ id, ...row }, supabase) => {
    const { data, error } = id
      ? await supabase
          .from("service_portfolio")
          .update(row)
          .eq("id", id)
          .eq("service_id", row.service_id)
          .select("id")
          .single()
      : await supabase.from("service_portfolio").insert(row).select("id").single();
    if (error) return { error: error.code === NO_ROWS || error.code === FK_VIOLATION ? notFound : error };
    return { id: data.id };
  });
}

export async function deleteServicePortfolioItem(input: unknown) {
  return mutate("cms.write", serviceB2bIdSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("service_portfolio").delete().eq("id", id)).error,
  }));
}
