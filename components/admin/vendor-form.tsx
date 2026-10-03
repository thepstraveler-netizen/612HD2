"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { saveVendor } from "@/lib/partners/admin-vendor-actions";
import {
  VENDOR_KINDS,
  VENDOR_STATUSES,
  vendorAdminSchema,
  type VendorAdminInput,
} from "@/schemas/vendor-admin";
import { SelectField, TextInputField, useUnsavedChangesWarning } from "./form-fields";
import { NoteField } from "./vendor-actions";
import { useSave } from "./use-save";

/** Staff edit (or create) of a vendor: status, commission, contact and tax details, notes. */
export function VendorForm({ defaultValues }: { defaultValues: VendorAdminInput }) {
  const t = useTranslations("vendorsAdmin.form");
  const tk = useTranslations("vendorsAdmin");
  const tc = useTranslations("cms.actions");
  const isNew = !defaultValues.id;
  const form = useForm<VendorAdminInput>({
    resolver: zodResolver(vendorAdminSchema, undefined, { raw: true }),
    defaultValues,
  });
  const { pending, onSubmit } = useSave(form, saveVendor, { listHref: "/admin/vendors", isNew });
  useUnsavedChangesWarning(form.formState.isDirty);

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-6">
        <h2 className="text-base font-semibold">{isNew ? t("createTitle") : t("title")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField<VendorAdminInput> name="name" label={t("name")} className="sm:col-span-2" />
          {isNew ? (
            <SelectField<VendorAdminInput>
              name="kind"
              label={t("kind")}
              options={VENDOR_KINDS.map((k) => ({ value: k, label: tk(`kinds.${k}`) }))}
            />
          ) : null}
          <SelectField<VendorAdminInput>
            name="status"
            label={t("status")}
            options={VENDOR_STATUSES.map((s) => ({ value: s, label: tk(`vendorStatus.${s}`) }))}
          />
          <TextInputField<VendorAdminInput>
            name="commission_percent"
            label={t("commission")}
            help={t("commissionHelp")}
          />
          <TextInputField<VendorAdminInput> name="contact_name" label={t("contactName")} />
          <TextInputField<VendorAdminInput> name="phone" label={t("phone")} type="tel" />
          <TextInputField<VendorAdminInput> name="email" label={t("email")} type="email" />
          <TextInputField<VendorAdminInput> name="city" label={t("city")} />
          <TextInputField<VendorAdminInput> name="address" label={t("address")} className="sm:col-span-2" />
          <TextInputField<VendorAdminInput> name="gstin" label={t("gstin")} />
          <TextInputField<VendorAdminInput> name="pan" label={t("pan")} />
        </div>
        <NoteField<VendorAdminInput> name="notes" label={t("notes")} help={t("notesHelp")} />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {isNew ? tc("create") : tc("save")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
