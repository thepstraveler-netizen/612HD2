import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Files a customer uploaded, removed when staff complete their account
 * deletion (D-109). Each kind lives in one folder per user:
 *
 *   prescriptions  bucket `prescriptions`, `<user id>/…`
 *   partner docs   bucket `documents`,     `partners/<user id>/…`
 *   review photos  bucket `media`,         `reviews/<user id>/…`
 *
 * Vendor documents (`documents/vendors/<vendor id>/…`) belong to the
 * business, not to one member, and stay. Paths recorded in the database rows
 * are included too, in case a file sits outside the usual folder.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type UserFileBucket = "prescriptions" | "documents" | "media";

export const USER_FILE_FOLDERS: readonly { bucket: UserFileBucket; folder: (userId: string) => string }[] = [
  { bucket: "prescriptions", folder: (id) => id },
  { bucket: "documents", folder: (id) => `partners/${id}` },
  { bucket: "media", folder: (id) => `reviews/${id}` },
];

/** Groups paths by bucket, dropping blanks and duplicates. */
export function groupPaths(entries: readonly { bucket: UserFileBucket; path: string | null | undefined }[]) {
  const grouped = new Map<UserFileBucket, Set<string>>();
  for (const { bucket, path } of entries) {
    const clean = path?.trim().replace(/^\/+/, "");
    if (!clean) continue;
    if (!grouped.has(bucket)) grouped.set(bucket, new Set());
    grouped.get(bucket)!.add(clean);
  }
  return new Map([...grouped].map(([bucket, paths]) => [bucket, [...paths].sort()]));
}

/** Paths from partner application `documents` JSON: [{ path, … }]. */
export function documentPaths(documents: unknown): string[] {
  if (!Array.isArray(documents)) return [];
  return documents.flatMap((d) =>
    typeof d === "object" && d !== null && typeof (d as { path?: unknown }).path === "string"
      ? [(d as { path: string }).path]
      : [],
  );
}

async function listFolder(db: Admin, bucket: UserFileBucket, folder: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error) throw new Error(`[privacy files] list ${bucket}/${folder}: ${error.message}`);
    // Folders come back with a null id; uploads are flat, so only files matter.
    paths.push(...data.filter((o) => o.id !== null).map((o) => `${folder}/${o.name}`));
    if (data.length < 1000) return paths;
  }
}

/** Every stored file of `userId`, read before the account (and its rows) are deleted. */
export async function collectUserFiles(db: Admin, userId: string) {
  const [prescriptions, applications, reviews] = await Promise.all([
    db.from("prescriptions").select("files").eq("user_id", userId),
    db.from("partner_applications").select("documents").eq("user_id", userId),
    db.from("reviews").select("id").eq("user_id", userId),
  ]);
  for (const res of [prescriptions, applications, reviews]) {
    if (res.error) throw new Error(`[privacy files] read rows: ${res.error.message}`);
  }
  const reviewIds = (reviews.data ?? []).map((r) => r.id);
  const media = reviewIds.length
    ? await db.from("review_media").select("file_path").in("review_id", reviewIds)
    : { data: [], error: null };
  if (media.error) throw new Error(`[privacy files] read review photos: ${media.error.message}`);

  const listed = await Promise.all(
    USER_FILE_FOLDERS.map(async ({ bucket, folder }) =>
      (await listFolder(db, bucket, folder(userId))).map((path) => ({ bucket, path })),
    ),
  );
  return groupPaths([
    ...listed.flat(),
    ...(prescriptions.data ?? []).flatMap((p) =>
      p.files.map((path) => ({ bucket: "prescriptions" as const, path })),
    ),
    ...(applications.data ?? []).flatMap((a) =>
      documentPaths(a.documents).map((path) => ({ bucket: "documents" as const, path })),
    ),
    ...(media.data ?? []).map((m) => ({ bucket: "media" as const, path: m.file_path })),
  ]);
}

/** Removes the files in batches of 100; returns how many were removed. */
export async function removeUserFiles(db: Admin, files: Map<UserFileBucket, string[]>): Promise<number> {
  let removed = 0;
  for (const [bucket, paths] of files) {
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error } = await db.storage.from(bucket).remove(batch);
      if (error) throw new Error(`[privacy files] remove from ${bucket}: ${error.message}`);
      removed += batch.length;
    }
  }
  return removed;
}
