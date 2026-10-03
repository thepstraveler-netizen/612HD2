"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  Building2,
  Car,
  Handshake,
  Loader2,
  Pill,
  Plane,
  Store,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type ComponentProps } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { submitPartnerApplication } from "@/lib/partners/actions";
import { missingDocuments } from "@/lib/partners/status";
import {
  PARTNER_DETAIL_FIELDS,
  PARTNER_STEPS,
  STEP_FIELDS,
  detailErrors,
  documentSlots,
  normalizeDetails,
  type PartnerStep,
} from "@/lib/partners/ui";
import { cn } from "@/lib/utils";
import {
  partnerApplicationSchema,
  type PartnerApplicationInput,
  type PartnerBusinessType,
  type PartnerDocumentKind,
} from "@/schemas/partners";
import { PartnerDocuments, uploadedDocs, type DocItem } from "./partner-documents";

const TYPE_ICONS: Record<PartnerBusinessType, LucideIcon> = {
  hotel: Building2,
  travel_agency: Plane,
  restaurant: UtensilsCrossed,
  transport: Car,
  shop: Store,
  pharmacy: Pill,
  service_provider: Wrench,
  other: Handshake,
};

type FormValues = PartnerApplicationInput;
type Name = FieldPath<FormValues>;

export type PartnerFormSettings = {
  businessTypes: PartnerBusinessType[];
  requiredDocuments: Partial<Record<PartnerBusinessType, PartnerDocumentKind[]>>;
  maxFileMb: number;
  agreement: { version: string; body: string };
};

/**
 * Partner With Us: business type → details → documents → agreement, kept
 * in one client form so nothing is lost moving between steps. Each step
 * is checked before moving on; the server checks everything again.
 */
export function PartnerApplyForm({
  settings,
  defaults,
  locale,
}: {
  settings: PartnerFormSettings;
  defaults: { contactName: string; email: string; phone: string };
  locale: "en" | "hi";
}) {
  const t = useTranslations("partner");
  const router = useRouter();
  const [step, setStep] = useState<PartnerStep>("type");
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [docError, setDocError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(partnerApplicationSchema, undefined, { raw: true }),
    defaultValues: {
      businessType: undefined,
      businessName: "",
      contactName: defaults.contactName,
      phone: defaults.phone,
      email: defaults.email,
      city: "",
      address: "",
      gstin: "",
      pan: "",
      website: "",
      details: {},
      message: "",
      documents: [],
      agreementVersion: settings.agreement.version,
      agreementName: "",
      acceptAgreement: false as unknown as true,
      locale,
    },
  });

  const type = form.watch("businessType") as PartnerBusinessType | undefined;
  const index = PARTNER_STEPS.indexOf(step);
  const slots = type ? documentSlots({ required_documents: settings.requiredDocuments }, type) : null;

  useEffect(() => {
    if (!moved.current) return;
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step]);

  const fieldError = (key: string) =>
    t.has(`fieldErrors.${key}`) ? t(`fieldErrors.${key}`) : t("fieldErrors.invalid");
  const kindLabel = (k: PartnerDocumentKind) => t(`documents.kinds.${k}`);

  const goTo = (next: PartnerStep) => {
    moved.current = true;
    setStep(next);
  };

  /** Checks the current step; true when it may move on. */
  async function checkStep(current: PartnerStep): Promise<boolean> {
    if (current === "documents") {
      if (!type) return false;
      if (docs.some((d) => d.state === "uploading")) {
        setDocError(t("documents.stillUploading"));
        return false;
      }
      const missing = missingDocuments(
        { required_documents: settings.requiredDocuments },
        type,
        uploadedDocs(docs),
      );
      if (missing.length) {
        setDocError(t("documents.missing", { list: missing.map(kindLabel).join(", ") }));
        return false;
      }
      setDocError(null);
      return true;
    }
    const fields = STEP_FIELDS[current] as readonly Name[];
    const ok = await form.trigger([...fields], { shouldFocus: true });
    if (current !== "details" || !type) return ok;
    form.clearErrors("details");
    const problems = Object.entries(
      detailErrors(type, (form.getValues("details") ?? {}) as Record<string, string>),
    );
    for (const [key, message] of problems) {
      form.setError(
        `details.${key}`,
        { type: "custom", message },
        { shouldFocus: ok && key === problems[0][0] },
      );
    }
    return ok && problems.length === 0;
  }

  async function next() {
    if (!(await checkStep(step))) {
      if (step !== "documents") toast.error(t("form.checkStep"));
      return;
    }
    const following = PARTNER_STEPS[index + 1];
    if (following) goTo(following);
  }

  const onSubmit = form.handleSubmit(
    async (values) => {
      if (!type) return goTo("type");
      for (const s of ["details", "documents"] as const) {
        if (!(await checkStep(s))) return goTo(s);
      }
      startSubmit(async () => {
        const result = await submitPartnerApplication({
          ...values,
          details: normalizeDetails(type, (values.details ?? {}) as Record<string, string>),
          documents: uploadedDocs(docs),
          locale,
          turnstileToken: captcha ?? undefined,
        });
        // Turnstile tokens are single use.
        setCaptchaKey((k) => k + 1);
        if (result.ok) {
          toast.success(t("status.sent", { reference: result.reference }));
          router.replace("/partner");
          router.refresh();
          return;
        }
        switch (result.error) {
          case "signIn":
            toast.error(t("errors.signIn"));
            router.push(`/login?next=${encodeURIComponent("/partner")}`);
            return;
          case "applicationOpen":
            toast.error(t("errors.applicationOpen"));
            router.replace("/partner");
            router.refresh();
            return;
          case "missingDocuments": {
            const missing = (result.missing ?? []) as PartnerDocumentKind[];
            setDocError(t("documents.missing", { list: missing.map(kindLabel).join(", ") }));
            toast.error(t("errors.missingDocuments"));
            goTo("documents");
            return;
          }
          case "invalid": {
            const field = result.field ?? "";
            if (field === "agreementVersion") {
              toast.error(t("errors.agreementChanged"));
              router.refresh();
              return;
            }
            toast.error(t("errors.invalid"));
            if (field === "businessType") return goTo("type");
            if (field.startsWith("documents")) return goTo("documents");
            if (field === "agreementName" || field === "acceptAgreement") return;
            if (field) form.setError(field as Name, { type: "server", message: "invalid" });
            goTo("details");
            return;
          }
          default:
            toast.error(t(`errors.${result.error}`));
        }
      });
    },
    (errors) => {
      toast.error(t("form.checkStep"));
      const first = Object.keys(errors)[0] ?? "";
      if (first === "businessType") goTo("type");
      else if ((STEP_FIELDS.details as readonly string[]).includes(first) || first === "details")
        goTo("details");
    },
  );

  const busy = submitting;
  const last = step === "agreement";

  return (
    <Form {...form}>
      <form
        aria-label={t("form.label")}
        noValidate
        onSubmit={(e) => {
          if (!last) {
            e.preventDefault();
            void next();
            return;
          }
          void onSubmit(e);
        }}
        className="space-y-6"
      >
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {t("form.stepOf", { current: index + 1, total: PARTNER_STEPS.length })}
          </p>
          <ol className="grid grid-cols-4 gap-2">
            {PARTNER_STEPS.map((s, i) => (
              <li key={s} aria-current={s === step ? "step" : undefined} className="space-y-1.5">
                <span className={cn("block h-1.5 rounded-full", i <= index ? "bg-primary" : "bg-muted")} />
                <span
                  className={cn(
                    "sr-only text-xs sm:not-sr-only sm:block",
                    s === step ? "font-semibold" : "text-muted-foreground",
                  )}
                >
                  {t(`form.steps.${s}`)}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <h2 ref={headingRef} tabIndex={-1} className="scroll-mt-24 text-xl font-bold outline-none">
          {step === "type"
            ? t("form.typeTitle")
            : step === "details"
              ? t("form.detailsTitle")
              : step === "documents"
                ? t("documents.title")
                : t("agreement.title")}
        </h2>

        {step === "type" ? (
          <FormField
            control={form.control}
            name="businessType"
            render={({ field }) => (
              <FormItem>
                <fieldset>
                  <legend className="sr-only">{t("form.typeTitle")}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {settings.businessTypes.map((value) => {
                      const Icon = TYPE_ICONS[value];
                      return (
                        <label
                          key={value}
                          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent has-checked:border-primary has-checked:bg-primary/5 has-checked:ring-2 has-checked:ring-primary/30 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
                        >
                          <input
                            type="radio"
                            name={field.name}
                            value={value}
                            checked={field.value === value}
                            onChange={() => field.onChange(value)}
                            onBlur={field.onBlur}
                            className="sr-only"
                          />
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy text-white">
                            <Icon className="size-5" aria-hidden="true" />
                          </span>
                          <span className="space-y-0.5">
                            <span className="block font-semibold">{t(`types.${value}.name`)}</span>
                            <span className="block text-sm text-muted-foreground">
                              {t(`types.${value}.hint`)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
        ) : null}

        {step === "details" ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                form={form}
                name="businessName"
                label={t("form.fields.businessName")}
                error={fieldError}
                autoComplete="organization"
                className="sm:col-span-2"
              />
              <TextField
                form={form}
                name="contactName"
                label={t("form.fields.contactName")}
                error={fieldError}
                autoComplete="name"
              />
              <TextField
                form={form}
                name="phone"
                label={t("form.fields.phone")}
                error={fieldError}
                autoComplete="tel"
                type="tel"
                inputMode="tel"
              />
              <TextField
                form={form}
                name="email"
                label={t("form.fields.email")}
                error={fieldError}
                autoComplete="email"
                type="email"
              />
              <TextField
                form={form}
                name="city"
                label={t("form.fields.city")}
                error={fieldError}
                autoComplete="address-level2"
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("form.fields.address")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ""} rows={3} autoComplete="street-address" />
                    </FormControl>
                    <FormMessage translateKey={fieldError} />
                  </FormItem>
                )}
              />
              <TextField form={form} name="gstin" label={t("form.fields.gstin")} error={fieldError} upper />
              <TextField form={form} name="pan" label={t("form.fields.pan")} error={fieldError} upper />
              <TextField
                form={form}
                name="website"
                label={t("form.fields.website")}
                error={fieldError}
                className="sm:col-span-2"
              />
            </div>

            {type ? (
              <fieldset className="space-y-4 rounded-2xl border p-4">
                <legend className="px-1 font-semibold">{t("form.moreTitle")}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {PARTNER_DETAIL_FIELDS[type].map((spec) => (
                    <FormField
                      key={`${type}-${spec.key}`}
                      control={form.control}
                      name={`details.${spec.key}`}
                      render={({ field }) => (
                        <FormItem className={spec.input === "text" ? "sm:col-span-2" : undefined}>
                          <FormLabel>{t(`detailFields.${spec.key}.label`)}</FormLabel>
                          <FormControl>
                            {spec.input === "select" ? (
                              <NativeSelect
                                name={field.name}
                                ref={field.ref}
                                onBlur={field.onBlur}
                                value={String(field.value ?? "")}
                                onChange={(e) => field.onChange(e.target.value)}
                              >
                                <option value="">{t("form.choose")}</option>
                                {spec.options.map((o) => (
                                  <option key={o} value={o}>
                                    {t(`detailFields.${spec.key}.options.${o}`)}
                                  </option>
                                ))}
                              </NativeSelect>
                            ) : (
                              <Input
                                name={field.name}
                                ref={field.ref}
                                onBlur={field.onBlur}
                                value={String(field.value ?? "")}
                                onChange={(e) => field.onChange(e.target.value)}
                                inputMode={spec.input === "number" ? "numeric" : undefined}
                                maxLength={spec.input === "text" ? spec.max : 6}
                                placeholder={
                                  t.has(`detailFields.${spec.key}.placeholder`)
                                    ? t(`detailFields.${spec.key}.placeholder`)
                                    : undefined
                                }
                              />
                            )}
                          </FormControl>
                          <FormMessage translateKey={fieldError} />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </fieldset>
            ) : null}

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.fields.message")}</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={3} maxLength={2000} />
                  </FormControl>
                  <FormMessage translateKey={fieldError} />
                </FormItem>
              )}
            />
          </div>
        ) : null}

        {step === "documents" && slots ? (
          <PartnerDocuments
            required={slots.required}
            optional={slots.optional}
            maxMb={settings.maxFileMb}
            items={docs}
            onChange={(update) => {
              setDocs(update);
              setDocError(null);
            }}
            error={docError}
          />
        ) : null}

        {step === "agreement" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("agreement.version", { version: settings.agreement.version })}
            </p>
            <div
              tabIndex={0}
              role="region"
              aria-label={t("agreement.title")}
              className="max-h-80 overflow-y-auto rounded-2xl border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-line focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {settings.agreement.body}
            </div>
            <TextField
              form={form}
              name="agreementName"
              label={t("agreement.name")}
              error={fieldError}
              autoComplete="name"
            />
            <FormField
              control={form.control}
              name="acceptAgreement"
              render={({ field }) => (
                <FormItem>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3">
                    <FormControl>
                      <input
                        type="checkbox"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        checked={field.value === true}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="mt-0.5 size-5 shrink-0 accent-primary"
                      />
                    </FormControl>
                    <span className="text-sm">{t("agreement.accept")}</span>
                  </label>
                  <FormMessage translateKey={fieldError} />
                </FormItem>
              )}
            />
            <p className="text-xs text-muted-foreground">{t("agreement.note")}</p>
            <TurnstileWidget action="partner" onToken={setCaptcha} resetKey={captchaKey} />
          </div>
        ) : null}

        <div className="sticky bottom-0 z-10 -mx-4 flex gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          {index > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => goTo(PARTNER_STEPS[index - 1])}
            >
              {t("form.back")}
            </Button>
          ) : null}
          <Button type="submit" size="lg" className="flex-1 sm:flex-none" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {last ? (busy ? t("form.submitting") : t("form.submit")) : t("form.next")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

type TextName =
  "businessName" | "contactName" | "phone" | "email" | "city" | "gstin" | "pan" | "website" | "agreementName";

function TextField({
  form,
  name,
  label,
  error,
  className,
  upper = false,
  ...input
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  name: TextName;
  label: string;
  error: (key: string) => string;
  className?: string;
  /** Shows typed letters in capitals (GSTIN, PAN); the schema upper-cases them too. */
  upper?: boolean;
} & Pick<ComponentProps<"input">, "autoComplete" | "type" | "inputMode">) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={String(field.value ?? "")}
              {...input}
              className={upper ? "uppercase" : undefined}
            />
          </FormControl>
          <FormMessage translateKey={error} />
        </FormItem>
      )}
    />
  );
}
