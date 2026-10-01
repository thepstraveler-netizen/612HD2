import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("submitSignup"), robots: { index: false } };
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <AuthCard
      title={t("signupTitle")}
      lead={t("signupLead")}
      footer={
        <p>
          {t("haveAccount")}{" "}
          <Link href={`/login${query}`} className="font-semibold text-primary hover:underline">
            {t("submitLogin")}
          </Link>
        </p>
      }
    >
      <GoogleButton next={next} />
      <OrDivider />
      <SignupForm next={next} />
    </AuthCard>
  );
}
