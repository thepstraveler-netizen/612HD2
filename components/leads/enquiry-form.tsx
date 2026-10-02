"use client";

import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { submitEnquiry } from "@/lib/leads/actions";
import { enquiryPayload, type EnquiryFormValues, type EnquiryTarget } from "@/lib/packages/ui";
import { cn } from "@/lib/utils";
import { packageEnquirySchema, serviceEnquirySchema, travelEnquirySchema } from "@/schemas/packages";
import { readAttribution } from "./attribution";

const FIELDS: readonly (keyof EnquiryFormValues)[] = [
  "startDate",
  "adults",
  "children",
  "from",
  "to",
  "departOn",
  "returnOn",
  "travelClass",
  "name",
  "phone",
  "email",
  "message",
];
const isField = (key: unknown): key is keyof EnquiryFormValues =>
  typeof key === "string" && (FIELDS as readonly string[]).includes(key);

const schemaFor = (target: EnquiryTarget) =>
  target.kind === "package"
    ? packageEnquirySchema
    : target.kind === "travel"
      ? travelEnquirySchema
      : serviceEnquirySchema;

/**
 * The one public enquiry form (package pages, /travel, enquiry-only service
 * pages). It adds the hidden honeypot and the visit's attribution, sends
 * the enquiry to submitEnquiry and shows the lead reference on success.
 * No sign-in needed.
 */
export function EnquiryForm({
  target,
  locale,
  travelClasses = [],
  minDate,
  maxTravellers = 20,
  initial,
  title,
  className,
}: {
  target: EnquiryTarget;
  locale: "en" | "hi";
  /** Travel only: class options for the chosen mode (settings `travel.defaults`). */
  travelClasses?: string[];
  /** Earliest date the date fields offer (India today). */
  minDate: string;
  maxTravellers?: number;
  initial?: Partial<EnquiryFormValues>;
  title?: string;
  className?: string;
}) {
  const t = useTranslations("enquiry");
  const [pending, start] = useTransition();
  const [reference, setReference] = useState<string | null>(null);

  const defaults: EnquiryFormValues = {
    startDate: "",
    adults: target.kind === "travel" ? "1" : "2",
    children: "0",
    from: "",
    to: "",
    departOn: "",
    returnOn: "",
    travelClass: "",
    name: "",
    phone: "",
    email: "",
    message: "",
    website: "",
    ...initial,
  };

  const resolver: Resolver<EnquiryFormValues> = async (values) => {
    const parsed = schemaFor(target).safeParse(enquiryPayload(target, values, { locale, attribution: {} }));
    if (parsed.success) return { values, errors: {} };
    const errors: FieldErrors<EnquiryFormValues> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (isField(key) && !errors[key]) errors[key] = { type: "validate", message: issue.message };
    }
    return { values: {}, errors };
  };

  const form = useForm<EnquiryFormValues>({ resolver, defaultValues: defaults });
  const mode = target.kind === "travel" ? target.mode : null;
  // Classes differ by mode: a train class means nothing for a bus.
  useEffect(() => {
    if (mode) form.setValue("travelClass", "");
  }, [mode, form]);

  const fieldError = (key: string) =>
    t.has(`fieldErrors.${key}`) ? t(`fieldErrors.${key}`) : t("fieldErrors.invalid");
  const classLabel = (c: string) => (t.has(`classes.${c}`) ? t(`classes.${c}`) : c);

  const onSubmit = form.handleSubmit(
    (values) =>
      start(async () => {
        const result = await submitEnquiry(
          enquiryPayload(target, values, { locale, attribution: readAttribution() }),
        );
        if (result.ok) {
          setReference(result.reference);
          return;
        }
        if (result.error === "invalid" && result.field) {
          const key = result.field.split(".")[0];
          if (isField(key)) {
            form.setError(key, { type: "server", message: "invalid" });
            form.setFocus(key);
          }
        }
        toast.error(t(`errors.${result.error}`));
      }),
    () => toast.error(t("fieldErrors.checkForm")),
  );

  if (reference) {
    const steps = target.kind === "service" ? "service" : target.kind;
    return (
      <section
        role="status"
        aria-live="polite"
        className={cn(
          "space-y-4 rounded-2xl border border-accent-green/40 bg-accent-green/10 p-5",
          className,
        )}
      >
        <p className="flex items-center gap-2 text-lg font-bold">
          <CheckCircle2 className="size-6 shrink-0 text-accent-green" aria-hidden="true" />
          {t("success.title")}
        </p>
        <p>
          {t("success.reference")}{" "}
          <span className="font-mono text-lg font-extrabold" data-testid="enquiry-reference">
            {reference}
          </span>
        </p>
        <div className="space-y-2 text-sm">
          <p className="font-semibold">{t("success.nextTitle")}</p>
          <ol className="list-decimal space-y-1 ps-5 text-muted-foreground">
            <li>{t(`success.next.${steps}.one`)}</li>
            <li>{t(`success.next.${steps}.two`)}</li>
            <li>{t(`success.next.${steps}.three`)}</li>
          </ol>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            form.reset(defaults);
            setReference(null);
          }}
        >
          {t("success.again")}
        </Button>
      </section>
    );
  }

  const number = (name: "adults" | "children", min: number) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t(`fields.${name}`)}</FormLabel>
          <FormControl>
            <Input type="number" inputMode="numeric" min={min} max={maxTravellers} {...field} />
          </FormControl>
          <FormMessage translateKey={fieldError} />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        noValidate
        className={cn("space-y-4 rounded-2xl border bg-card p-4 sm:p-5", className)}
        aria-label={title ?? t("title")}
      >
        {title ? <h2 className="text-lg font-bold">{title}</h2> : null}

        {target.kind === "travel" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="from"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.from")}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      maxLength={80}
                      placeholder={t("fields.fromPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage translateKey={fieldError} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.to")}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      maxLength={80}
                      placeholder={t("fields.toPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage translateKey={fieldError} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="departOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.departOn")}</FormLabel>
                  <FormControl>
                    <Input type="date" min={minDate} {...field} />
                  </FormControl>
                  <FormMessage translateKey={fieldError} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="returnOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.returnOn")}</FormLabel>
                  <FormControl>
                    <Input type="date" min={form.watch("departOn") || minDate} {...field} />
                  </FormControl>
                  <FormMessage translateKey={fieldError} />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              {number("adults", 1)}
              {number("children", 0)}
            </div>
            {travelClasses.length ? (
              <FormField
                control={form.control}
                name="travelClass"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fields.travelClass")}</FormLabel>
                    <FormControl>
                      <NativeSelect {...field}>
                        <option value="">{t("fields.anyClass")}</option>
                        {travelClasses.map((c) => (
                          <option key={c} value={c}>
                            {classLabel(c)}
                          </option>
                        ))}
                      </NativeSelect>
                    </FormControl>
                  </FormItem>
                )}
              />
            ) : null}
          </div>
        ) : null}

        {target.kind === "package" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.startDate")}</FormLabel>
                  <FormControl>
                    <Input type="date" min={minDate} {...field} />
                  </FormControl>
                  <FormMessage translateKey={fieldError} />
                </FormItem>
              )}
            />
            {number("adults", 1)}
            {number("children", 0)}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("fields.name")}</FormLabel>
                <FormControl>
                  <Input autoComplete="name" maxLength={120} {...field} />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.phone")}</FormLabel>
                <FormControl>
                  <Input type="tel" inputMode="tel" autoComplete="tel" {...field} />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.email")}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" maxLength={200} {...field} />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("fields.message")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    maxLength={2000}
                    placeholder={t(`fields.messagePlaceholder.${target.kind}`)}
                    {...field}
                  />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
        </div>

        {/* Honeypot: hidden from people and assistive tech; bots fill every field. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            {t("fields.website")}
            <input type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("privacy")}</p>
          <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
            {pending ? <Loader2 className="animate-spin" /> : <Send />} {t("submit")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
