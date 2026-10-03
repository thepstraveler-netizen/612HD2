/** Whether an account nav link is the current section (`/account` only matches itself). */
export function isActiveAccountLink(pathname: string, href: string): boolean {
  return href === "/account" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
