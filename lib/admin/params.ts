import { notFound } from "next/navigation";
import { z } from "zod";

/** `[id]` segment of an admin edit route: a uuid, or "new" for the create form. */
export function parseEditId(raw: string): { isNew: true; id: null } | { isNew: false; id: string } {
  if (raw === "new") return { isNew: true, id: null };
  if (!z.uuid().safeParse(raw).success) notFound();
  return { isNew: false, id: raw };
}
