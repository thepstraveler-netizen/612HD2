"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider, useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { createManualLead } from "@/lib/leads/crm-actions";
import { manualLeadSchema, type ManualLeadInput } from "@/schemas/leads";
import { LEAD_KINDS } from "@/schemas/packages";
import { SelectField, SwitchField, TextInputField } from "./form-fields";
import { LeadSheet, TextareaField, useLeadAction } from "./lead-shared";

/**
 * "New lead" for enquiries that arrive by phone, WhatsApp or at the
 * counter. Source defaults to calling; the lead opens once created.
 */
export function NewLeadButton({ sources }: { sources: string[] }) {
  const t = useTranslations("leadsAdmin");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus /> {t("newLead")}
      </Button>
      <LeadSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("newLeadForm.title")}
        lead={t("newLeadForm.lead")}
      >
        <NewLeadForm sources={sources} onCreated={() => setOpen(false)} />
      </LeadSheet>
    </>
  );
}

function NewLeadForm({ sources, onCreated }: { sources: string[]; onCreated: () => void }) {
  const t = useTranslations("leadsAdmin");
  const router = useRouter();
  const { pending, run, errorText } = useLeadAction();
  const form = useForm<ManualLeadInput>({
    resolver: zodResolver(manualLeadSchema, undefined, { raw: true }),
    defaultValues: {
      kind: "general",
      name: "",
      phone: "",
      email: "",
      source: sources.includes("calling") ? "calling" : (sources[0] ?? "calling"),
      message: "",
      packageId: "",
      assignToMe: true,
    },
  });
  const sourceLabel = (s: string) => (t.has(`sources.${s}`) ? t(`sources.${s}`) : s);

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="grid gap-4"
        onSubmit={form.handleSubmit(
          (values) =>
            run(createManualLead, values, {
              onDone: (result) => {
                toast.success(t("newLeadForm.created", { reference: result.reference ?? "" }));
                onCreated();
                if (result.id) router.push(`/admin/leads/${result.id}`);
              },
              onError: (r) =>
                r.field && form.setError(r.field as Path<ManualLeadInput>, { message: errorText(r.error) }),
            }),
          () => toast.error(t("errors.invalid")),
        )}
      >
        <TextInputField<ManualLeadInput> name="name" label={t("newLeadForm.name")} />
        <TextInputField<ManualLeadInput>
          name="phone"
          label={t("newLeadForm.phone")}
          type="tel"
          placeholder="98765 43210"
        />
        <TextInputField<ManualLeadInput> name="email" label={t("newLeadForm.email")} type="email" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField<ManualLeadInput>
            name="kind"
            label={t("newLeadForm.kind")}
            options={LEAD_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
          />
          <SelectField<ManualLeadInput>
            name="source"
            label={t("newLeadForm.source")}
            options={sources.map((s) => ({ value: s, label: sourceLabel(s) }))}
          />
        </div>
        <TextareaField<ManualLeadInput>
          name="message"
          label={t("newLeadForm.message")}
          placeholder={t("newLeadForm.messagePlaceholder")}
        />
        <SwitchField<ManualLeadInput> name="assignToMe" label={t("newLeadForm.assignToMe")} />
        <Button type="submit" disabled={pending}>
          {t("newLeadForm.submit")}
        </Button>
      </form>
    </FormProvider>
  );
}
