import type {
  ApplicationStatus,
  PartnerBusinessType,
  PartnerDocumentKind,
  PartnersSettings,
} from "@/schemas/partners";

/** Pure helpers shared by the onboarding form, the admin queue and notifications. */

/** "PA-00042" */
export function applicationReference(number: number): string {
  return `PA-${String(number).padStart(5, "0")}`;
}

/** Documents still missing for a business type, in the order settings list them. */
export function missingDocuments(
  settings: Pick<PartnersSettings, "required_documents">,
  type: PartnerBusinessType,
  uploaded: readonly { kind: PartnerDocumentKind }[],
): PartnerDocumentKind[] {
  const have = new Set(uploaded.map((d) => d.kind));
  return (settings.required_documents[type] ?? []).filter((kind) => !have.has(kind));
}

/** Default commission for a business type, basis points (falls back to 10%). */
export function defaultCommissionBps(
  settings: Pick<PartnersSettings, "commission_bps">,
  type: PartnerBusinessType,
): number {
  return settings.commission_bps[type] ?? 1000;
}

/** Whether staff can still act on an application. */
export function isOpenApplication(status: ApplicationStatus): boolean {
  return status === "submitted" || status === "under_review";
}

export function documentExtension(mime: string): "pdf" | "jpg" | "png" | "webp" {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}
