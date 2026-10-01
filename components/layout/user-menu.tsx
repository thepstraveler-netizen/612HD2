"use client";

import type { User } from "@supabase/supabase-js";
import { LayoutDashboard, LogOut, Store, Truck, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/actions";
import { STAFF_ROLES, type RoleKey } from "@/lib/permissions/constants";
import { createClient } from "@/lib/supabase/client";

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Client-side so public pages stay statically renderable. Role-based links
 * here are only shortcuts; every area re-checks permissions on the server.
 */
export function UserMenu() {
  const t = useTranslations("nav");
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!configured) return;
    const supabase = createClient();
    const load = async (u: User | null) => {
      setUser(u);
      if (u) {
        const { data } = await supabase.rpc("current_user_roles");
        setRoles(data ?? []);
      } else {
        setRoles([]);
      }
      setReady(true);
    };
    supabase.auth.getUser().then(({ data }) => load(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="size-11" aria-hidden="true" />;

  if (!user) {
    return (
      <Button asChild size="sm" className="h-10">
        <Link href="/login">{t("login")}</Link>
      </Button>
    );
  }

  const name = (user.user_metadata.full_name as string | undefined) ?? user.email ?? "";
  const isStaff = roles.some((r) => STAFF_ROLES.includes(r as RoleKey));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("account")} className="rounded-full">
          <Avatar>
            <AvatarImage src={user.user_metadata.avatar_url as string | undefined} alt="" />
            <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound /> {t("account")}
          </Link>
        </DropdownMenuItem>
        {isStaff ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <LayoutDashboard /> {t("admin")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {roles.includes("vendor") ? (
          <DropdownMenuItem asChild>
            <Link href="/vendor">
              <Store /> {t("vendor")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {roles.includes("driver") ? (
          <DropdownMenuItem asChild>
            <Link href="/driver">
              <Truck /> {t("driver")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
