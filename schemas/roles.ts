import { z } from "zod";

/** Admin → Settings → Staff and roles (D-107). Role keys come from the `roles` table. */

const roleKey = z
  .string()
  .regex(/^[a-z_]+$/, { error: "invalidRole" })
  .max(40);

export const grantRoleSchema = z.object({
  email: z.string().trim().toLowerCase().email({ error: "invalidEmail" }).max(254),
  role: roleKey,
});
export type GrantRoleInput = z.input<typeof grantRoleSchema>;

export const revokeRoleSchema = z.object({
  user_id: z.uuid(),
  role: roleKey,
});
