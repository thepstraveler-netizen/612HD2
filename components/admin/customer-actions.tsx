"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, Trash2, Unlock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";
import {
  addCustomerNote,
  adjustCustomerPoints,
  deleteCustomerNote,
  setCustomerBlocked,
} from "@/lib/customers/actions";
import {
  adjustPointsSchema,
  customerNoteSchema,
  type AdjustPointsInput,
  type CustomerNoteInput,
} from "@/schemas/engagement-admin";

/** Staff actions on Admin → Customers → customer: points, notes, block / unblock (customers.write). */

function useResultToast() {
  const t = useTranslations("customersAdmin");
  return (result: MutationResult, success: string) => {
    if (result.ok) {
      toast.success(success);
      return true;
    }
    toast.error(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.saveFailed"));
    return false;
  };
}

function fieldError(t: ReturnType<typeof useTranslations>, message: string | undefined) {
  if (!message) return null;
  return (
    <p className="text-sm text-destructive">
      {t.has(`errors.${message}`) ? t(`errors.${message}`) : message}
    </p>
  );
}

export function AdjustPointsForm({ userId }: { userId: string }) {
  const t = useTranslations("customersAdmin");
  const router = useRouter();
  const show = useResultToast();
  const [pending, start] = useTransition();
  const form = useForm<AdjustPointsInput>({
    resolver: zodResolver(adjustPointsSchema, undefined, { raw: true }),
    defaultValues: { user_id: userId, points: "", note: "" },
  });
  const { errors } = form.formState;
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const result = await adjustCustomerPoints(values);
      if (show(result, t("points.saved"))) {
        form.reset({ user_id: userId, points: "", note: "" });
        router.refresh();
      } else if (!result.ok && result.field) {
        form.setError(result.field as "points" | "note", { message: result.error });
      }
    }),
  );
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border p-3" noValidate>
      <p className="text-sm font-medium">{t("points.adjust")}</p>
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="adj-points">{t("points.amount")}</Label>
          <Input
            id="adj-points"
            inputMode="numeric"
            placeholder="+100 / -50"
            aria-invalid={!!errors.points}
            {...form.register("points")}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="adj-note">{t("points.reason")}</Label>
          <Input id="adj-note" maxLength={300} aria-invalid={!!errors.note} {...form.register("note")} />
        </div>
      </div>
      {fieldError(t, errors.points?.message)}
      {fieldError(t, errors.note?.message)}
      <p className="text-xs text-muted-foreground">{t("points.help")}</p>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {t("points.submit")}
        </Button>
      </div>
    </form>
  );
}

export function NoteForm({ userId }: { userId: string }) {
  const t = useTranslations("customersAdmin");
  const router = useRouter();
  const show = useResultToast();
  const [pending, start] = useTransition();
  const form = useForm<CustomerNoteInput>({
    resolver: zodResolver(customerNoteSchema, undefined, { raw: true }),
    defaultValues: { user_id: userId, body: "" },
  });
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      if (show(await addCustomerNote(values), t("notes.saved"))) {
        form.reset({ user_id: userId, body: "" });
        router.refresh();
      }
    }),
  );
  return (
    <form onSubmit={onSubmit} className="grid gap-2" noValidate>
      <Label htmlFor="note-body" className="sr-only">
        {t("notes.add")}
      </Label>
      <Textarea
        id="note-body"
        rows={3}
        maxLength={2000}
        placeholder={t("notes.placeholder")}
        aria-invalid={!!form.formState.errors.body}
        {...form.register("body")}
      />
      {fieldError(t, form.formState.errors.body?.message)}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {t("notes.add")}
        </Button>
      </div>
    </form>
  );
}

export function DeleteNoteButton({ id, userId }: { id: string; userId: string }) {
  const t = useTranslations("customersAdmin");
  const router = useRouter();
  const show = useResultToast();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={t("notes.delete")}
      onClick={() => {
        if (!window.confirm(t("notes.confirmDelete"))) return;
        start(async () => {
          if (show(await deleteCustomerNote({ id, user_id: userId }), t("notes.deleted"))) router.refresh();
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}

export function BlockButton({ userId, blocked }: { userId: string; blocked: boolean }) {
  const t = useTranslations("customersAdmin");
  const router = useRouter();
  const show = useResultToast();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={blocked ? "outline" : "destructive"}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(blocked ? t("block.confirmUnblock") : t("block.confirmBlock"))) return;
        start(async () => {
          const result = await setCustomerBlocked({ user_id: userId, blocked: !blocked });
          if (show(result, blocked ? t("block.unblocked") : t("block.blocked"))) router.refresh();
        });
      }}
    >
      {blocked ? <Unlock /> : <Ban />} {blocked ? t("block.unblock") : t("block.block")}
    </Button>
  );
}
