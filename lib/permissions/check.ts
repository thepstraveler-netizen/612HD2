import { ADMIN_MODULES, type AdminModuleKey, type PermissionKey } from "./constants";

/** Pure permission check, shared by server guards and UI filtering. */
export function hasPermission(granted: Iterable<string>, required: PermissionKey): boolean {
  for (const key of granted) if (key === required) return true;
  return false;
}

export function hasAnyPermission(granted: Iterable<string>, required: readonly PermissionKey[]) {
  const set = new Set(granted);
  return required.some((key) => set.has(key));
}

export function isAdminModule(value: string): value is AdminModuleKey {
  return (ADMIN_MODULES as readonly string[]).includes(value);
}

/** Modules whose `.read` permission the user holds, in sidebar order. */
export function visibleModules(granted: Iterable<string>): AdminModuleKey[] {
  const set = new Set(granted);
  return ADMIN_MODULES.filter((m) => set.has(`${m}.read`));
}
