import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminPasswordForm } from "@/components/auth/admin-password-form";
import { AuthCard } from "@/components/auth/auth-card";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("adminPasswordTitle"), robots: { index: false } };
}

/** Staff who signed in by email link or Google type their password here to open the admin area (D-111). */
export default async function AdminPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <div className="mx-auto max-w-md">
      <AuthCard title={t("adminPasswordTitle")} lead={t("adminPasswordLead")}>
        <AdminPasswordForm next={next} />
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
            {t("adminPasswordForgot")}
          </Link>
        </p>
      </AuthCard>
    </div>
  );
}
