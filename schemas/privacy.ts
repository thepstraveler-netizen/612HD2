import { z } from "zod";

/**
 * Privacy requests (Phase 11, D-095): a customer asks for their account to
 * be deleted; staff complete or reject the request. Messages are keys under
 * `privacy.errors` / `privacyAdmin.errors`.
 */

export const deletionRequestSchema = z.object({
  reason: z.string().trim().max(1000, { error: "tooLong" }).optional().default(""),
  // The customer ticks "I understand" on the confirm step.
  confirm: z.literal(true, { error: "confirmRequired" }),
});
export type DeletionRequestInput = z.input<typeof deletionRequestSchema>;

export const privacyRequestIdSchema = z.object({ id: z.uuid() });

export const completeDeletionSchema = z.object({
  id: z.uuid(),
  note: z.string().trim().max(1000, { error: "tooLong" }).optional().default(""),
});
export type CompleteDeletionInput = z.input<typeof completeDeletionSchema>;

export const rejectPrivacyRequestSchema = z.object({
  id: z.uuid(),
  note: z.string().trim().min(1, { error: "reasonRequired" }).max(1000, { error: "tooLong" }),
});
export type RejectPrivacyRequestInput = z.input<typeof rejectPrivacyRequestSchema>;
