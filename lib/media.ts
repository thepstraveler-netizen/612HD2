/** Public URL for an object in the `media` bucket (served through next/image). */
export function mediaUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base}/storage/v1/object/public/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}
