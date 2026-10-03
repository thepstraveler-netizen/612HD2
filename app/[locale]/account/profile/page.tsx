import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/account/profile-form";
import { requireUser } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.profile");
  return { title: t("title"), robots: { index: false } };
}

export default async function ProfilePage() {
  const session = await requireUser("/account/profile");
  const t = await getTranslations("account.profile");
  const p = session.profile;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[length:var(--text-title)] font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      <ProfileForm
        email={session.user.email ?? ""}
        defaults={{
          fullName: p?.full_name ?? "",
          phone: p?.phone ?? "",
          preferredLocale: p?.preferred_locale ?? "en",
        }}
      />
    </div>
  );
}
