"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition, type ComponentProps } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { updateVendorProfile } from "@/lib/partners/vendor-actions";
import { vendorProfileSchema, type VendorProfileInput } from "@/schemas/partners";

type Name = FieldPath<VendorProfileInput>;

/** Contact, tax and payout details a vendor keeps up to date themselves. */
export function VendorBusinessForm({ vendorId, initial }: { vendorId: string; initial: VendorProfileInput }) {
  const t = useTranslations("vendorBusiness");
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const form = useForm<VendorProfileInput>({
    resolver: zodResolver(vendorProfileSchema, undefined, { raw: true }),
    defaultValues: initial,
  });
  const fieldError = (key: string) =>
    t.has(`fieldErrors.${key}`) ? t(`fieldErrors.${key}`) : t("fieldErrors.invalid");

  const onSubmit = form.handleSubmit(
    (values) =>
      startSave(async () => {
        const result = await updateVendorProfile({ vendorId, ...values });
        if (result.ok) {
          toast.success(t("form.saved"));
          router.refresh();
          return;
        }
        if (result.field && result.field !== "vendorId") {
          form.setError(
            result.field as Name,
            { type: "server", message: result.error },
            { shouldFocus: true },
          );
          toast.error(t("errors.invalid"));
          return;
        }
        toast.error(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.saveFailed"));
      }),
    () => toast.error(t("errors.invalid")),
  );

  const text = (
    name: Name,
    label: string,
    props: Partial<ComponentProps<"input">> = {},
    className?: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={typeof field.value === "string" ? field.value : ""}
              onChange={(e) => field.onChange(e.target.value)}
              {...props}
            />
          </FormControl>
          <FormMessage translateKey={fieldError} />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate aria-labelledby="business-form" className="space-y-6">
        <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
          <h2 id="business-form" className="text-lg font-semibold">
            {t("form.title")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("contactName", t("form.contactName"), { autoComplete: "name" })}
            {text("phone", t("form.phone"), { type: "tel", inputMode: "tel", autoComplete: "tel" })}
            {text("email", t("form.email"), { type: "email", autoComplete: "email" }, "sm:col-span-2")}
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>{t("form.address")}</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={3} autoComplete="street-address" />
                  </FormControl>
                  <FormMessage translateKey={fieldError} />
                </FormItem>
              )}
            />
            {text("city", t("form.city"), { autoComplete: "address-level2" })}
            <span className="hidden sm:block" />
            {text("gstin", t("form.gstin"), { className: "uppercase", maxLength: 15 })}
            {text("pan", t("form.pan"), { className: "uppercase", maxLength: 10 })}
          </div>
        </section>

        <section aria-labelledby="payout-form" className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
          <div className="space-y-1">
            <h2 id="payout-form" className="text-lg font-semibold">
              {t("form.payoutTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("form.payoutLead")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("bank.holder", t("form.holder"), { autoComplete: "off" }, "sm:col-span-2")}
            {text("bank.account_number", t("form.account_number"), {
              inputMode: "numeric",
              autoComplete: "off",
            })}
            {text("bank.ifsc", t("form.ifsc"), {
              className: "uppercase",
              maxLength: 11,
              autoComplete: "off",
            })}
            {text("bank.bank", t("form.bank"), { autoComplete: "off" })}
            {text("bank.upi_id", t("form.upi_id"), { autoComplete: "off", inputMode: "email" })}
          </div>
        </section>

        <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {saving ? t("form.saving") : t("form.save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
