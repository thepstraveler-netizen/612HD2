"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import type { z } from "zod";
import { AuthorizationError, assertPermission } from "@/lib/auth/guards";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import type { PermissionKey } from "@/lib/permissions/constants";
import { createClient } from "@/lib/supabase/server";
import {
  bannerFormSchema,
  businessProfileSchema,
  deleteSchema,
  faqFormSchema,
  featureFlagSchema,
  mediaRegisterSchema,
  navLinkFormSchema,
  sectionContentSchemas,
  sectionFormSchema,
  serviceFormSchema,
  testimonialFormSchema,
} from "@/schemas/cms";

/**
 * CMS mutations. Every action: (1) checks the permission server-side,
 * (2) validates input with the shared zod schema, (3) writes as the signed-in
 * user so RLS applies too, (4) the audit trigger records the change, and
 * (5) the public catalog cache is revalidated so the site updates at once.
 */

export type MutationResult = { ok: true; id?: string } | { ok: false; error: string; field?: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function mutate<S extends z.ZodType>(
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
    if (error.code === "invalidJson" || error.code === "invalidContent")
      return { ok: false, error: error.code };
    console.error("[cms] write failed", error);
    return { ok: false, error: "saveFailed" };
  }
  revalidateTag(CATALOG_TAG);
  revalidatePath("/[locale]/admin", "layout");
  return { ok: true, id };
}

// ------------------------------------------------------------- services

export async function saveService(input: unknown) {
  return mutate("cms.write", serviceFormSchema, input, async ({ id, description, ...rest }, supabase) => {
    // `description` is NOT NULL in the table; an empty one is stored as {en: ""}.
    const row = { ...rest, description: description ?? { en: "" } };
    const { data, error } = id
      ? await supabase.from("services").update(row).eq("id", id).select("id").single()
      : await supabase.from("services").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

// ------------------------------------------------------------- sections

export async function saveSection(input: unknown) {
  return mutate("cms.write", sectionFormSchema, input, async ({ id, contentJson, ...row }, supabase) => {
    const { data: existing, error: readError } = await supabase
      .from("cms_sections")
      .select("type")
      .eq("id", id)
      .single();
    if (readError) return { error: readError };
    let content: unknown;
    try {
      content = JSON.parse(contentJson || "{}");
    } catch {
      return { error: { message: "invalidJson", code: "invalidJson" } };
    }
    const parsed = sectionContentSchemas[existing.type].safeParse(content);
    if (!parsed.success) return { error: { message: "invalidContent", code: "invalidContent" } };
    const { error } = await supabase
      .from("cms_sections")
      .update({ ...row, content: parsed.data as Record<string, unknown> as never })
      .eq("id", id);
    return { id, error };
  });
}

// ------------------------------------------------------------- banners

export async function saveBanner(input: unknown) {
  return mutate("offers.write", bannerFormSchema, input, async ({ id, ...row }, supabase) => {
    const { data, error } = id
      ? await supabase.from("offers_banners").update(row).eq("id", id).select("id").single()
      : await supabase.from("offers_banners").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

export async function deleteBanner(input: unknown) {
  return mutate("offers.write", deleteSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("offers_banners").delete().eq("id", id)).error,
  }));
}

// ------------------------------------------------------------- testimonials

export async function saveTestimonial(input: unknown) {
  return mutate("cms.write", testimonialFormSchema, input, async ({ id, ...row }, supabase) => {
    const { data, error } = id
      ? await supabase.from("testimonials").update(row).eq("id", id).select("id").single()
      : await supabase.from("testimonials").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

export async function deleteTestimonial(input: unknown) {
  return mutate("cms.write", deleteSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("testimonials").delete().eq("id", id)).error,
  }));
}

// ------------------------------------------------------------- faqs

export async function saveFaq(input: unknown) {
  return mutate("cms.write", faqFormSchema, input, async ({ id, ...row }, supabase) => {
    const { data, error } = id
      ? await supabase.from("faqs").update(row).eq("id", id).select("id").single()
      : await supabase.from("faqs").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

export async function deleteFaq(input: unknown) {
  return mutate("cms.write", deleteSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("faqs").delete().eq("id", id)).error,
  }));
}

// ------------------------------------------------------------- navigation

export async function saveNavLink(input: unknown) {
  return mutate("cms.write", navLinkFormSchema, input, async ({ id, ...row }, supabase) => {
    const { data, error } = id
      ? await supabase.from("navigation_links").update(row).eq("id", id).select("id").single()
      : await supabase.from("navigation_links").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

export async function deleteNavLink(input: unknown) {
  return mutate("cms.write", deleteSchema, input, async ({ id }, supabase) => ({
    error: (await supabase.from("navigation_links").delete().eq("id", id)).error,
  }));
}

// ------------------------------------------------------------- settings

export async function saveBusinessProfile(input: unknown) {
  return mutate("settings.write", businessProfileSchema, input, async (value, supabase) => ({
    error: (await supabase.from("settings").upsert({ key: "business.profile", value, is_public: true }))
      .error,
  }));
}

export async function setFeatureFlag(input: unknown) {
  return mutate("settings.write", featureFlagSchema, input, async ({ key, enabled }, supabase) => ({
    error: (await supabase.from("feature_flags").update({ enabled }).eq("key", key)).error,
  }));
}

// ------------------------------------------------------------- media

/**
 * Registers an image the browser already uploaded to the `media` bucket
 * (Storage RLS allowed the upload). Returns the media row id to attach.
 */
export async function registerMedia(input: unknown) {
  const permission: PermissionKey = "cms.write";
  return mutate(permission, mediaRegisterSchema, input, async (row, supabase) => {
    const { data, error } = await supabase.from("media").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}

export async function registerOfferMedia(input: unknown) {
  return mutate("offers.write", mediaRegisterSchema, input, async (row, supabase) => {
    const { data, error } = await supabase.from("media").insert(row).select("id").single();
    return { id: data?.id, error };
  });
}
