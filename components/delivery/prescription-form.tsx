"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { submitPrescription } from "@/lib/delivery/actions";
import { checkPrescriptionFiles, PRESCRIPTION_MAX_FILES, prescriptionPath } from "@/lib/delivery/ui";
import { createClient } from "@/lib/supabase/client";
import { deliveryAddressSchema, prescriptionSchema } from "@/schemas/delivery";

const formSchema = z.object({
  patientName: prescriptionSchema.shape.patientName,
  patientAge: z.union([z.literal(""), z.string().regex(/^\d{1,3}$/, { error: "invalidAge" })]),
  contactName: deliveryAddressSchema.shape.contactName,
  phone: deliveryAddressSchema.shape.phone,
  line1: deliveryAddressSchema.shape.line1,
  line2: deliveryAddressSchema.shape.line2,
  landmark: deliveryAddressSchema.shape.landmark,
  pincode: deliveryAddressSchema.shape.pincode,
  zoneId: z.uuid({ error: "required" }),
  notes: z.string().trim().max(1000).optional(),
});
type FormInput = z.input<typeof formSchema>;

/**
 * Prescription upload: files go straight from the browser to the private
 * `prescriptions` bucket under the customer's own folder (the storage
 * policy allows nothing else), then `submitPrescription` records them for
 * a licensed pharmacist to review.
 */
export function PrescriptionForm({
  userId,
  zones,
  defaults,
}: {
  userId: string;
  zones: { id: string; name: string }[];
  defaults: {
    name: string;
    phone: string;
    address: { line1: string; line2: string; landmark: string; pincode: string; zoneId: string } | null;
  };
}) {
  const t = useTranslations("medicine.form");
  const tc = useTranslations("checkout");
  const router = useRouter();
  const fileInputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "saving">("idle");
  const [pending, start] = useTransition();

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema, undefined, { raw: true }),
    defaultValues: {
      patientName: defaults.name,
      patientAge: "",
      contactName: defaults.name,
      phone: defaults.phone,
      line1: defaults.address?.line1 ?? "",
      line2: defaults.address?.line2 ?? "",
      landmark: defaults.address?.landmark ?? "",
      pincode: defaults.address?.pincode ?? "",
      zoneId: defaults.address?.zoneId || (zones.length === 1 ? zones[0].id : ""),
      notes: "",
    },
  });
  const fieldError = (key: string) =>
    t.has(`fieldErrors.${key}`)
      ? t(`fieldErrors.${key}`)
      : tc.has(`fieldErrors.${key}`)
        ? tc(`fieldErrors.${key}`)
        : tc("fieldErrors.invalid");

  function pickFiles(list: FileList | null) {
    const next = [...files, ...Array.from(list ?? [])];
    const problem = checkPrescriptionFiles(next);
    if (problem && problem !== "empty") {
      setFileError(t(`fileErrors.${problem}`, { max: PRESCRIPTION_MAX_FILES }));
      return;
    }
    setFileError(null);
    setFiles(next);
  }

  const onSubmit = form.handleSubmit(
    (values) =>
      start(async () => {
        setFormError(null);
        const problem = checkPrescriptionFiles(files);
        if (problem) {
          setFileError(t(`fileErrors.${problem}`, { max: PRESCRIPTION_MAX_FILES }));
          toast.error(t(`fileErrors.${problem}`, { max: PRESCRIPTION_MAX_FILES }));
          return;
        }
        setStep("uploading");
        const supabase = createClient();
        const paths: string[] = [];
        for (const file of files) {
          const path = prescriptionPath(userId, crypto.randomUUID(), file.name);
          const { error } = await supabase.storage
            .from("prescriptions")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (error) {
            setStep("idle");
            setFormError(t("errors.upload"));
            toast.error(t("errors.upload"));
            return;
          }
          paths.push(path);
        }
        setStep("saving");
        const result = await submitPrescription({
          patientName: values.patientName,
          patientAge: values.patientAge === "" ? "" : Number(values.patientAge),
          address: {
            contactName: values.contactName,
            phone: values.phone,
            line1: values.line1,
            line2: values.line2?.trim() || undefined,
            landmark: values.landmark?.trim() || undefined,
            pincode: values.pincode?.trim() || "",
            zoneId: values.zoneId,
          },
          files: paths,
          notes: values.notes?.trim() || undefined,
        });
        setStep("idle");
        if (!result.ok) {
          if (result.error === "signin") router.push(`/login?next=${encodeURIComponent("/medicine")}`);
          const message = t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.unknown");
          setFormError(message);
          toast.error(message);
          return;
        }
        toast.success(t("submitted"));
        router.push(`/account/prescriptions/${result.id}`);
      }),
    () => toast.error(tc("fieldErrors.checkForm")),
  );

  const busy = pending || step !== "idle";

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="space-y-6 rounded-2xl border bg-card p-4 sm:p-6">
        <fieldset className="space-y-3">
          <legend className="mb-1 text-base font-bold">{t("filesTitle")}</legend>
          <p className="text-sm text-muted-foreground">{t("filesHint", { max: PRESCRIPTION_MAX_FILES })}</p>
          <label
            htmlFor={fileInputId}
            className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center text-sm hover:border-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
          >
            <Upload className="size-6 text-primary" aria-hidden="true" />
            <span className="font-semibold">{t("chooseFiles")}</span>
            <span className="text-xs text-muted-foreground">{t("fileTypes")}</span>
            <input
              id={fileInputId}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="sr-only"
              disabled={busy || files.length >= PRESCRIPTION_MAX_FILES}
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {files.length ? (
            <ul className="space-y-2" aria-label={t("chosenFiles")}>
              {files.map((f, i) => {
                const Icon = f.type === "application/pdf" ? FileText : ImageIcon;
                return (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-3 rounded-xl border p-2 text-sm"
                  >
                    <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(f.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={t("removeFile", { name: f.name })}
                    >
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {fileError ? (
            <p role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-base font-bold">{t("patientTitle")}</legend>
          <FormField
            control={form.control}
            name="patientName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.patientName")}</FormLabel>
                <FormControl>
                  <Input autoComplete="name" {...field} />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="patientAge"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.patientAge")}</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" maxLength={3} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-base font-bold">{t("addressTitle")}</legend>
          <FormField
            control={form.control}
            name="zoneId"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("fields.zone")}</FormLabel>
                <FormControl>
                  <NativeSelect {...field}>
                    <option value="">{t("fields.zonePlaceholder")}</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contactName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.contactName")}</FormLabel>
                <FormControl>
                  <Input autoComplete="name" {...field} />
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
                <FormLabel>{tc("fields.phone")}</FormLabel>
                <FormControl>
                  <Input type="tel" inputMode="tel" autoComplete="tel" {...field} />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="line1"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("fields.line1")}</FormLabel>
                <FormControl>
                  <Input autoComplete="address-line1" maxLength={200} {...field} />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="line2"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("fields.line2")}</FormLabel>
                <FormControl>
                  <Input autoComplete="address-line2" maxLength={200} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="landmark"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.landmark")}</FormLabel>
                <FormControl>
                  <Input maxLength={120} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pincode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.pincode")}</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={6}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("fields.notes")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    maxLength={1000}
                    placeholder={t("fields.notesPlaceholder")}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage translateKey={fieldError} />
              </FormItem>
            )}
          />
        </fieldset>

        <p className="text-xs text-muted-foreground">{t("privacy")}</p>

        <p aria-live="assertive" className="empty:hidden">
          {formError ? (
            <span className="block rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {formError}
            </span>
          ) : null}
        </p>

        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}{" "}
          {step === "uploading" ? t("uploading") : step === "saving" ? t("saving") : t("submit")}
        </Button>
      </form>
    </Form>
  );
}
