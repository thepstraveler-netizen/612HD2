"use server";

import { getSession } from "@/lib/auth/session";
import { hasServiceRole } from "@/lib/env.server";
import { getLivePackage } from "@/lib/packages/queries";
import { enquirySchema, type Enquiry } from "@/schemas/packages";
import type { Json } from "@/types/database";
import { createLead, LeadError, type NewLead } from "./capture";

/**
 * Public enquiry forms (packages, flights / trains / buses, service pages).
 * No sign-in needed; signed-in customers are linked to their lead. The
 * database throttles repeat enquiries per phone number.
 */

export type EnquiryResult =
  | { ok: true; reference: string }
  | {
      ok: false;
      error: "invalid" | "rate_limited" | "not_found" | "unavailable" | "unknown";
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
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: "invalid", field: issue?.path.join(".") };
  }
  const e = parsed.data;
  // Bots fill the hidden field; answer as if it worked.
  if (e.website) return { ok: true, reference: "LD-00000" };
  if (!hasServiceRole()) return { ok: false, error: "unavailable" };

  const session = await getSession();
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
    details: details(e),
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
