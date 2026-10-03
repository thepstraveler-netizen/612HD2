"use server";

import { getSession } from "@/lib/auth/session";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLivePackage } from "@/lib/packages/queries";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { verifyCaptcha } from "@/lib/security/turnstile";
import { enquirySchema, type Enquiry } from "@/schemas/packages";
import type { Json } from "@/types/database";
import { createLead, LeadError, type NewLead } from "./capture";

/** A published plan of the service the enquiry is for (service role: the form may be stale). */
async function getServicePlan(
  planId: string,
  serviceSlug: string,
): Promise<{ id: string; name: string; pricePaise: number | null } | null> {
  const { data } = await createAdminClient()
    .from("service_plans")
    .select("id, name, price_paise, is_published, services!inner(slug)")
    .eq("id", planId)
    .eq("services.slug", serviceSlug)
    .eq("is_published", true)
    .maybeSingle();
  return data ? { id: data.id, name: data.name.en, pricePaise: data.price_paise } : null;
}

/**
 * Public enquiry forms (packages, flights / trains / buses, service pages).
 * No sign-in needed; signed-in customers are linked to their lead. The
 * database throttles repeat enquiries per phone number.
 */

export type EnquiryResult =
  | { ok: true; reference: string }
  | {
      ok: false;
      error: "invalid" | "rate_limited" | "rateLimited" | "captcha" | "not_found" | "unavailable" | "unknown";
      field?: string;
    };

function details(e: Enquiry): Record<string, Json> {
  if (e.kind === "package") {
    return { start_date: e.startDate || null, adults: e.adults, children: e.children };
  }
  if (e.kind === "flight" || e.kind === "train" || e.kind === "bus") {
    return {
      from: e.from,
      to: e.to,
      depart_on: e.departOn,
      return_on: e.returnOn || null,
      adults: e.adults,
      children: e.children,
      class: e.travelClass || null,
    };
  }
  return {};
}

export async function submitEnquiry(input: unknown): Promise<EnquiryResult> {
  // Bots fill the hidden field; answer as if it worked.
  if (input && typeof input === "object" && "website" in input && input.website) {
    return { ok: true, reference: "LD-00000" };
  }
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: "invalid", field: issue?.path.join(".") };
  }
  const e = parsed.data;
  if (!hasServiceRole()) return { ok: false, error: "unavailable" };

  const session = await getSession();
  // Per visitor (IP / account); the database separately throttles per phone number.
  if (!(await enforceRateLimit("enquiry", { userId: session?.user.id })).ok)
    return { ok: false, error: "rateLimited" };
  if (!(await verifyCaptcha(e.turnstileToken)).ok) return { ok: false, error: "captcha" };
  const plan = "planId" in e && e.planId ? await getServicePlan(e.planId, e.serviceSlug) : null;
  if ("planId" in e && e.planId && !plan) return { ok: false, error: "not_found" };
  let pkg: { id: string; title: string } | null = null;
  if (e.kind === "package") {
    const found = await getLivePackage(e.packageSlug);
    if (!found) return { ok: false, error: "not_found" };
    pkg = { id: found.id, title: found.title.en };
  }

  const lead: NewLead = {
    kind: e.kind,
    name: e.name,
    phone: e.phone,
    email: e.email || session?.user.email || null,
    message: e.message || null,
    details: plan
      ? { ...details(e), plan_id: plan.id, plan: plan.name, plan_price_paise: plan.pricePaise }
      : details(e),
    packageId: pkg?.id ?? null,
    packageTitle: pkg?.title ?? null,
    serviceSlug: "serviceSlug" in e && e.serviceSlug ? e.serviceSlug : null,
    userId: session?.user.id ?? null,
    attribution: e.attribution,
    locale: e.locale,
  };
  try {
    const created = await createLead(lead);
    return { ok: true, reference: created.reference };
  } catch (error) {
    if (error instanceof LeadError && error.code === "rate_limited")
      return { ok: false, error: "rate_limited" };
    console.error("[leads] submitEnquiry failed", error);
    return { ok: false, error: "unknown" };
  }
}
