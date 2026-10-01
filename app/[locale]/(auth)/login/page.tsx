import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("submitLogin"), robots: { index: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const t = await getTranslations("auth");
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <AuthCard
      title={t("loginTitle")}
      lead={t("loginLead")}
      footer={
        <p>
          {t("noAccount")}{" "}
          <Link href={`/signup${query}`} className="font-semibold text-primary hover:underline">
            {t("submitSignup")}
          </Link>
        </p>
      }
    >
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {t("callbackError")}
        </p>
      ) : null}
      <GoogleButton next={next} />
      <OrDivider />
      <LoginForm next={next} />
    </AuthCard>
  );
}
