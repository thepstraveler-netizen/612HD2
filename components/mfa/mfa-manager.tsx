"use client";

import { Loader2, ShieldCheck, ShieldPlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/account/copy-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { removeTotpFactor, startTotpEnrollment, verifyTotpCode, type MfaError } from "@/lib/mfa/actions";
import { qrImageSrc } from "@/lib/mfa/policy";
import { mfaCodeSchema } from "@/schemas/security";
import { CodeInput } from "./code-input";

type FactorView = { id: string; name: string; addedOn: string };
type Enrolment = { factorId: string; qrCode: string; secret: string };

/** Two-step sign-in on Account → Privacy & security: set up (QR + code), list and remove. */
export function MfaManager({ factors, canManage }: { factors: FactorView[]; canManage: boolean }) {
  const t = useTranslations("mfa");
  const router = useRouter();
  const id = useId();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const errorText = (e: MfaError) => t(`errors.${e}`);

  const begin = () =>
    start(async () => {
      setError(null);
      const result = await startTotpEnrollment();
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      setCode("");
      setEnrolment({ factorId: result.factorId, qrCode: result.qrCode, secret: result.secret });
    });

  const verify = () => {
    if (!enrolment) return;
    if (!mfaCodeSchema.safeParse(code).success) {
      setError(errorText("codeInvalid"));
      return;
    }
    start(async () => {
      const result = await verifyTotpCode({ factorId: enrolment.factorId, code });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      toast.success(t("enabled"));
      setEnrolment(null);
      router.refresh();
    });
  };

  const remove = (factorId: string) => {
    if (!window.confirm(t("confirmRemove"))) return;
    start(async () => {
      const result = await removeTotpFactor({ factorId });
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      toast.success(t("removed"));
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4">
      {factors.length ? (
        <ul className="grid gap-2">
          {factors.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <span className="flex min-w-0 items-center gap-2">
                <ShieldCheck className="size-5 shrink-0 text-accent-green" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{f.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("addedOn", { date: f.addedOn })}
                  </span>
                </span>
              </span>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={t("remove")}
                  onClick={() => remove(f.id)}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      )}

      {enrolment ? (
        <form
          className="grid gap-4 rounded-xl border p-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            <li>{t("step1")}</li>
            <li>{t("step2")}</li>
            <li>{t("step3")}</li>
          </ol>
          <div className="flex flex-wrap items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL from Supabase */}
            <img
              src={qrImageSrc(enrolment.qrCode)}
              alt={t("qrAlt")}
              width={176}
              height={176}
              className="mx-auto size-44 shrink-0 rounded-lg border bg-white p-2 sm:mx-0"
            />
            <div className="grid min-w-0 flex-1 gap-2">
              <p className="text-sm text-muted-foreground">{t("cantScan")}</p>
              <code className="block rounded-lg bg-muted p-2 font-mono text-sm break-all select-all">
                {enrolment.secret}
              </code>
              <div>
                <CopyButton value={enrolment.secret} label={t("copySecret")} />
              </div>
            </div>
          </div>
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
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {t("verify")}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setEnrolment(null)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      ) : canManage ? (
        <div>
          <Button
            type="button"
            variant={factors.length ? "outline" : "default"}
            disabled={busy}
            onClick={begin}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ShieldPlus />}{" "}
            {factors.length ? t("addAnother") : t("setUp")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
