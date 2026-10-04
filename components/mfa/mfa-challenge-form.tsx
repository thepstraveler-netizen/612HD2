"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { verifyTotpCode } from "@/lib/mfa/actions";
import { mfaCodeSchema } from "@/schemas/security";
import { CodeInput } from "./code-input";

/** The sign-in code prompt: verifies against the user's authenticator, then continues to `next`. */
export function MfaChallengeForm({ factorId, next }: { factorId: string; next: string }) {
  const t = useTranslations("mfa");
  const router = useRouter();
  const id = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!mfaCodeSchema.safeParse(code).success) {
          setError(t("errors.codeInvalid"));
          return;
        }
        start(async () => {
          const result = await verifyTotpCode({ factorId, code });
          if (!result.ok) {
            setError(t(`errors.${result.error}`));
            setCode("");
            return;
          }
          router.replace(next);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-code`}>{t("codeLabel")}</Label>
        <CodeInput
          id={`${id}-code`}
          value={code}
          onChange={setCode}
          invalid={!!error}
          describedBy={error ? `${id}-error` : undefined}
          autoFocus
        />
        {error ? (
          <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="h-12 w-full sm:h-11" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {t("continue")}
      </Button>
    </form>
  );
}
