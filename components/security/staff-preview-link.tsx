"use client";

import { usePathname } from "next/navigation";

const PREVIEW_PATH = "/api/security/maintenance-preview";

/** Quiet link for staff on the maintenance page: opens a preview of the page they were on. */
export function StaffPreviewLink({ label }: { label: string }) {
  const pathname = usePathname() || "/";
  return (
    <a
      href={`${PREVIEW_PATH}?next=${encodeURIComponent(pathname)}`}
      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      rel="nofollow"
    >
      {label}
    </a>
  );
}

/** Ends the staff preview (turns draft mode off) and reloads the current page. */
export function ExitPreviewLink({ label }: { label: string }) {
  const pathname = usePathname() || "/";
  return (
    <a
      href={`${PREVIEW_PATH}?exit=1&next=${encodeURIComponent(pathname)}`}
      className="font-semibold underline underline-offset-4"
      rel="nofollow"
    >
      {label}
    </a>
  );
}
