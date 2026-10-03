/**
 * Which deployment this bundle came from, inlined at build time (next.config
 * sets NEXT_PUBLIC_BUILD_ID from Vercel's deployment id). "local" outside
 * Vercel, where the stale-tab guard stays off (D-105).
 */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "local";

export const VERSION_PATH = "/api/version";

/** Text of an error, rejection reason or error event, for matching. */
function errorText(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name} ${reason.message}`;
  if (typeof reason === "string") return reason;
  return "";
}

/**
 * Errors a tab opened before the latest deploy hits when it asks for code
 * that deployment no longer serves: a script chunk (404) or a server action
 * id. Reloading picks up the current deployment and fixes both.
 */
export function isStaleBuildError(reason: unknown): boolean {
  const text = errorText(reason);
  return (
    /ChunkLoadError|Loading (?:CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module/i.test(
      text,
    ) || /Server Action .* was not found on the server|failed-to-find-server-action/i.test(text)
  );
}

type AnchorLike = {
  href: string;
  origin: string;
  target: string;
  hasAttribute(name: string): boolean;
};

type ClickLike = {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/**
 * Whether a click on `anchor` should become a full page load because this
 * tab's bundle is out of date: a plain left click on a same-origin link that
 * opens in this tab and isn't a download.
 */
export function shouldHardNavigate(click: ClickLike, anchor: AnchorLike, siteOrigin: string): boolean {
  if (click.defaultPrevented || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  return anchor.origin === siteOrigin;
}
