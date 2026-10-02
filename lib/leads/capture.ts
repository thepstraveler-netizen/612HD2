import "server-only";
import { z } from "zod";
import { getService } from "@/lib/catalog/queries";
import { publicEnv } from "@/lib/env";
import { notify } from "@/lib/notifications/service";
import { pickLocalized } from "@/lib/i18n/localized";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadKind } from "@/schemas/packages";
import type { Json } from "@/types/database";
import { leadSource } from "./attribution";
import { getLeadsSettings } from "./settings";
import { leadReference, summarizeLead } from "./status";

/**
 * Writes a lead (any enquiry form, or an agent typing one in) and sends
 * the acknowledgement to the customer and the new-lead alert to the
 * assigned agent. Runs with the service role after validation.
 */

export type NewLead = {
  kind: LeadKind;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  details: Record<string, Json>;
  packageId?: string | null;
  packageTitle?: string | null;
  serviceSlug?: string | null;
  userId: string | null;
  /** Explicit CRM source (agent-entered leads); otherwise derived from attribution. */
  source?: string;
  attribution?: {
    source?: string;
    utm: Record<string, string | undefined>;
    referrer?: string;
    landingPath?: string;
  };
  locale: "en" | "hi";
  createdBy?: string | null;
};

export class LeadError extends Error {
  constructor(readonly code: "rate_limited" | "unknown") {
    super(code);
  }
}

const createdSchema = z.object({ id: z.uuid(), number: z.number(), assigned_to: z.uuid().nullable() });

function site(): string {
  return publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}

export async function createLead(
  input: NewLead,
): Promise<{ id: string; reference: string; assignedTo: string | null }> {
  const admin = createAdminClient();
  const settings = await getLeadsSettings();
  const attribution = input.attribution ?? { utm: {} };
  const source =
    input.source && settings.sources.includes(input.source)
      ? input.source
      : leadSource({ ...attribution, utm: attribution.utm }, settings.sources);
  const utm = Object.fromEntries(Object.entries(attribution.utm).filter(([, v]) => Boolean(v)));

  const { data, error } = await admin.rpc("create_lead", {
    p: {
      kind: input.kind,
      name: input.name,
      phone: input.phone,
      email: input.email,
      message: input.message,
      details: input.details,
      package_id: input.packageId ?? null,
      service_slug: input.serviceSlug ?? null,
      user_id: input.userId,
      source,
      utm,
      referrer: attribution.referrer ?? null,
      landing_path: attribution.landingPath ?? null,
      locale: input.locale,
      created_by: input.createdBy ?? null,
    },
  });
  if (error) {
    if (error.message.includes("rate_limited")) throw new LeadError("rate_limited");
    console.error("[leads] create_lead failed", error);
    throw new LeadError("unknown");
  }
  const created = createdSchema.parse(data);
  const reference = leadReference(created.number);

  const serviceName = input.serviceSlug
    ? pickLocalized((await getService(input.serviceSlug))?.name, "en") || null
    : null;
  const summary = summarizeLead({
    kind: input.kind,
    details: input.details,
    packageTitle: input.packageTitle,
    serviceName,
  });
  const values = { name: input.name, reference, summary, phone: input.phone, source };

  await notify({
    key: "lead.received",
    locale: input.locale,
    to: { email: input.email, phone: input.phone, userId: input.userId },
    values,
  });
  if (created.assigned_to && created.assigned_to !== input.createdBy) {
    await notifyAssignee(created.id, created.assigned_to, values);
  }
  return { id: created.id, reference, assignedTo: created.assigned_to };
}

/** Emails the agent a lead was given to. */
export async function notifyAssignee(
  leadId: string,
  assignee: string,
  values: { name: string; reference: string; summary: string; phone: string; source: string },
): Promise<void> {
  const { data: agent } = await createAdminClient()
    .from("profiles")
    .select("email, phone, preferred_locale")
    .eq("id", assignee)
    .maybeSingle();
  if (!agent) return;
  await notify({
    key: "lead.assigned",
    locale: agent.preferred_locale === "hi" ? "hi" : "en",
    to: { email: agent.email, phone: agent.phone, userId: assignee },
    values: { ...values, lead_url: `${site()}/admin/leads/${leadId}` },
  });
}
