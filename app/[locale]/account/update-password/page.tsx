import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("updateTitle"), robots: { index: false } };
}

/** Reached from the password-reset email (via /auth/callback) or from the account page. */
export default async function UpdatePasswordPage() {
  const t = await getTranslations("auth");
  return (
    <div className="mx-auto max-w-md">
      <AuthCard title={t("updateTitle")}>
        <UpdatePasswordForm />
      </AuthCard>
    </div>
  );
}
