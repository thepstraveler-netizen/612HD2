"use client";

import { ShieldPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";
import { grantRole, revokeRole } from "@/lib/roles/actions";
import type { RoleHolder, RoleOption } from "@/lib/roles/queries";

/** Admin → Settings → Staff and roles: grant a role by email, remove one with a click (D-107). */
export function RoleManager({
  roles,
  holders,
  currentUserId,
  canGrantSuperAdmin,
}: {
  roles: RoleOption[];
  holders: RoleHolder[];
  currentUserId: string;
  canGrantSuperAdmin: boolean;
}) {
  const t = useTranslations("rolesAdmin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const grantable = roles.filter((r) => r.key !== "super_admin" || canGrantSuperAdmin);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(grantable.find((r) => r.key === "agent")?.key ?? grantable[0]?.key ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const roleName = (key: string) => (t.has(`roles.${key}`) ? t(`roles.${key}`) : key);
  const errorText = (code: string) =>
    t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.saveFailed");
  const show = (result: MutationResult, success: string) => {
    if (result.ok) {
      toast.success(success);
      router.refresh();
      return true;
    }
    toast.error(errorText(result.error));
    return false;
  };

  const onGrant = (event: FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    start(async () => {
      const result = await grantRole({ email, role });
      if (show(result, t("granted", { role: roleName(role), email: email.trim() }))) setEmail("");
      else if (!result.ok && result.field === "email") setFieldError(errorText(result.error));
    });
  };

  const onRevoke = (holder: RoleHolder, key: string) => {
    const who = holder.fullName ?? holder.email ?? "";
    if (!window.confirm(t("confirmRevoke", { role: roleName(key), name: who }))) return;
    start(async () => {
      show(
        await revokeRole({ user_id: holder.userId, role: key }),
        t("revoked", { role: roleName(key), name: who }),
      );
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={onGrant}
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-end"
          >
            <div className="space-y-2">
              <Label htmlFor="role-email">{t("email")}</Label>
              <Input
                id="role-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                required
                value={email}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "role-email-error" : "role-email-help"}
                onChange={(e) => setEmail(e.target.value)}
              />
              {fieldError ? (
                <p id="role-email-error" className="text-sm text-destructive">
                  {fieldError}
                </p>
              ) : (
                <p id="role-email-help" className="text-sm text-muted-foreground">
                  {t("emailHelp")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-key">{t("role")}</Label>
              <NativeSelect id="role-key" value={role} onChange={(e) => setRole(e.target.value)}>
                {grantable.map((r) => (
                  <option key={r.key} value={r.key}>
                    {roleName(r.key)}
                  </option>
                ))}
              </NativeSelect>
              {/* Keep the button aligned with the inputs while the email help shows. */}
              <p className="hidden text-sm md:invisible md:block">&nbsp;</p>
            </div>
            <div className="md:pb-7">
              <Button type="submit" disabled={pending || !email.trim()} className="w-full md:w-auto">
                <ShieldPlus /> {t("grant")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{t("rolesHelp")}</p>

      {holders.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {holders.map((holder) => (
            <li key={holder.userId} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {holder.fullName ?? holder.email ?? t("unknownUser")}
                  {holder.userId === currentUserId ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{t("you")}</span>
                  ) : null}
                </p>
                {holder.fullName && holder.email ? (
                  <p className="truncate text-sm text-muted-foreground">{holder.email}</p>
                ) : null}
                {holder.isBlocked ? <p className="text-sm text-destructive">{t("blocked")}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {holder.roles.map((r) => {
                  const removable =
                    holder.userId !== currentUserId && (r.key !== "super_admin" || canGrantSuperAdmin);
                  return (
                    <Badge key={r.key} variant="secondary" className="gap-1 py-1 pr-1 pl-2.5 text-sm">
                      {roleName(r.key)}
                      {removable ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onRevoke(holder, r.key)}
                          aria-label={t("revoke", {
                            role: roleName(r.key),
                            name: holder.fullName ?? holder.email ?? "",
                          })}
                          className="inline-flex size-7 items-center justify-center rounded-full hover:bg-destructive/10 hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </Badge>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
