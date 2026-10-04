"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider, useForm, useWatch, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { logLeadActivity } from "@/lib/leads/crm-actions";
import { cn } from "@/lib/utils";
import {
  CALL_OUTCOMES,
  LOGGABLE_ACTIVITIES,
  leadActivitySchema,
  type LeadActivityInput,
} from "@/schemas/leads";
import { TextInputField } from "./form-fields";
import { TextareaField, useLeadAction } from "./lead-shared";
import { fromLocalInput } from "./use-save";

/**
 * Logs a note, call (outcome + minutes), WhatsApp, email or SMS on the
 * lead, optionally with the next follow-up. Logging a contact on a New lead
 * moves it to Contacted (server side).
 */
export function LeadLogForm({ leadId }: { leadId: string }) {
  const t = useTranslations("leadsAdmin");
  const tc = useTranslations("cms.errors");
  const { pending, run, errorText } = useLeadAction();
  const [followUp, setFollowUp] = useState("");
  const blank: LeadActivityInput = {
    leadId,
    kind: "note",
    body: "",
    callOutcome: undefined,
    callMinutes: "",
  };
  const form = useForm<LeadActivityInput>({
    resolver: zodResolver(leadActivitySchema, undefined, { raw: true }),
    defaultValues: blank,
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const outcomeError = form.formState.errors.callOutcome?.message;

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="grid gap-4"
        onSubmit={form.handleSubmit(
          (values) => {
            const at = fromLocalInput(followUp);
            if (at && Date.parse(at) <= Date.now()) {
              toast.error(t("followUpCard.pastTime"));
              return;
            }
            run(
              logLeadActivity,
              {
                ...values,
                callMinutes:
                  values.kind === "call" && values.callMinutes !== "" ? values.callMinutes : undefined,
                callOutcome: values.kind === "call" ? values.callOutcome : undefined,
                followUpAt: at || undefined,
              },
              {
                success: t("logForm.logged"),
                onDone: () => {
                  form.reset({ ...blank, kind: values.kind });
                  setFollowUp("");
                },
                onError: (r) =>
                  r.field &&
                  form.setError(r.field as Path<LeadActivityInput>, { message: errorText(r.error) }),
              },
            );
          },
          () => toast.error(t("errors.invalid")),
        )}
      >
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{t("logForm.kind")}</legend>
          <div className="flex flex-wrap gap-2">
            {LOGGABLE_ACTIVITIES.map((k) => (
              <label
                key={k}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50",
                  kind === k
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-accent",
                )}
              >
                <input type="radio" value={k} className="sr-only" {...form.register("kind")} />
                {t(`activity.${k}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {kind === "call" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="f-callOutcome">{t("logForm.outcome")}</Label>
              <NativeSelect
                id="f-callOutcome"
                defaultValue=""
                aria-invalid={!!outcomeError}
                {...form.register("callOutcome")}
              >
                <option value="" disabled>
                  {t("logForm.pickOutcome")}
                </option>
                {CALL_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {t(`callOutcomes.${o}`)}
                  </option>
                ))}
              </NativeSelect>
              {outcomeError ? (
                <p className="text-sm text-destructive">
                  {tc.has(outcomeError) ? tc(outcomeError) : outcomeError}
                </p>
              ) : null}
            </div>
            <TextInputField<LeadActivityInput>
              name="callMinutes"
              label={t("logForm.minutes")}
              placeholder="5"
            />
          </div>
        ) : null}

        <TextareaField<LeadActivityInput>
          name="body"
          label={kind === "call" ? t("logForm.callNotes") : t("logForm.body")}
          placeholder={t(`logForm.placeholders.${kind ?? "note"}`)}
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-full flex-1 gap-1.5 sm:max-w-64 sm:min-w-0">
            <Label htmlFor="log-follow-up">{t("logForm.followUp")}</Label>
            <Input
              id="log-follow-up"
              type="datetime-local"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending} className="flex-1 sm:flex-none">
            <Send /> {t("logForm.submit")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
