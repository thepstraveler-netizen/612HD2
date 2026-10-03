import "server-only";

/**
 * Hook for a future virus / malware scanner (D-097). Customer and partner
 * files never pass through the app server: the browser uploads them straight
 * to Supabase Storage with a one-time signed URL (or, for prescriptions, under
 * the storage policy), and the server only records the path afterwards. So
 * there is no single "upload finished" place to scan in-line yet.
 *
 * Where a real scanner should be called, once one is chosen:
 *   - lib/partners/actions.ts submitPartnerApplication (each `documents[].path`)
 *   - lib/partners/vendor-actions.ts saveVendorDocument (`path`)
 *   - lib/delivery/actions.ts submitPrescription (`files[].path`)
 *   - lib/reviews/actions.ts submitReview (`photos[]`, public `media` bucket)
 * or, better, a Supabase Storage webhook / Edge Function on object create
 * that downloads the object, scans it and quarantines it on a hit.
 *
 * Until then the no-op scanner below reports every file as clean. Uploads are
 * already limited to PDF / JPG / PNG / WebP by MIME type and size, and
 * private buckets are only served through short-lived signed links.
 */

export type FileScanTarget = { bucket: string; path: string; mimeType?: string; size?: number };

export type FileScanResult = { clean: true } | { clean: false; reason: string };

export interface FileScanner {
  readonly name: string;
  scan(file: FileScanTarget): Promise<FileScanResult>;
}

export const noopFileScanner: FileScanner = {
  name: "noop",
  async scan() {
    return { clean: true };
  },
};

/** The scanner for this deployment. Replace with a real adapter when one exists. */
export function defaultFileScanner(): FileScanner {
  return noopFileScanner;
}

/** Scans several files; the first infected one wins. */
export async function scanFiles(
  files: FileScanTarget[],
  scanner: FileScanner = defaultFileScanner(),
): Promise<FileScanResult> {
  for (const file of files) {
    const result = await scanner.scan(file);
    if (!result.clean) return result;
  }
  return { clean: true };
}
