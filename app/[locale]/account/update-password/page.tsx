import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("updateTitle"), robots: { index: false } };
}

/** Reached from the password-reset email (via /auth/callback) or from the account page. */
export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const { reason, next } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <div className="mx-auto max-w-md">
      <AuthCard title={t("updateTitle")}>
        {reason === "admin" ? (
          <p role="status" className="mb-4 rounded-xl bg-secondary p-3 text-sm">
            {t("adminStrengthNotice")}
          </p>
        ) : null}
        <UpdatePasswordForm next={reason === "admin" ? next : undefined} />
      </AuthCard>
    </div>
  );
}
