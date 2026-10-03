"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Pencil, Plus, Star, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { deleteTraveller, saveTraveller, setDefaultTraveller } from "@/lib/account/actions";
import { GENDERS, travellerSchema, type Gender, type TravellerInput } from "@/schemas/account";

export type SavedTraveller = {
  id: string;
  fullName: string;
  relation: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  phone: string | null;
  isDefault: boolean;
};

const toInput = (t: SavedTraveller | null): TravellerInput => ({
  fullName: t?.fullName ?? "",
  relation: t?.relation ?? "",
  dateOfBirth: t?.dateOfBirth ?? "",
  gender: t?.gender ?? "",
  phone: t?.phone ?? "",
  isDefault: t?.isDefault ?? false,
});

function TravellerForm({ traveller, onDone }: { traveller: SavedTraveller | null; onDone: () => void }) {
  const t = useTranslations("travellers");
  const te = useTranslations("account.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<TravellerInput>({
    resolver: zodResolver(travellerSchema, undefined, { raw: true }),
    defaultValues: toInput(traveller),
  });
  const errorText = (key: string) => (te.has(key) ? te(key) : te("generic"));
  const today = new Date().toISOString().slice(0, 10);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveTraveller({ ...values, id: traveller?.id });
      if (result.ok) {
        toast.success(t("saved"));
        onDone();
        router.refresh();
      } else {
        toast.error(te(result.error === "unknown" ? "generic" : result.error));
      }
    }),
  );

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2"
        noValidate
      >
        <h2 className="text-base font-bold sm:col-span-2">{traveller ? t("edit") : t("add")}</h2>
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>{t("fields.fullName")}</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage translateKey={errorText} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="relation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("fields.relation")}</FormLabel>
              <FormControl>
                <Input placeholder={t("fields.relationHint")} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage translateKey={errorText} />
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
                <Input type="tel" inputMode="tel" autoComplete="off" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage translateKey={errorText} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dateOfBirth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("fields.dateOfBirth")}</FormLabel>
              <FormControl>
                <Input type="date" min="1900-01-02" max={today} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage translateKey={errorText} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("fields.gender")}</FormLabel>
              <FormControl>
                <NativeSelect {...field} value={field.value ?? ""}>
                  <option value="">{t("fields.genderPick")}</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {t(`genders.${g}`)}
                    </option>
                  ))}
                </NativeSelect>
              </FormControl>
              <FormMessage translateKey={errorText} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isDefault"
          render={({ field }) => (
            <FormItem className="flex min-h-11 items-center gap-3 sm:col-span-2">
              <FormControl>
                <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">{t("fields.isDefault")}</FormLabel>
            </FormItem>
          )}
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Saved travellers: list, add, edit, delete and pick the default. */
export function TravellerManager({ travellers, locale }: { travellers: SavedTraveller[]; locale: string }) {
  const t = useTranslations("travellers");
  const te = useTranslations("account.errors");
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const dateFormat = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const run = (action: () => Promise<{ ok: boolean }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else toast.error(te("generic"));
    });

  return (
    <div className="space-y-4">
      {editing === "new" ? (
        <TravellerForm traveller={null} onDone={() => setEditing(null)} />
      ) : (
        <Button onClick={() => setEditing("new")}>
          <Plus /> {t("add")}
        </Button>
      )}
      {travellers.length === 0 && editing !== "new" ? (
        <EmptyState icon={Users} title={t("empty")} description={t("emptyBody")} />
      ) : null}
      <ul className="grid gap-3">
        {travellers.map((tr) =>
          editing === tr.id ? (
            <li key={tr.id}>
              <TravellerForm traveller={tr} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={tr.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-card p-4"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {tr.fullName}
                  {tr.isDefault ? <Badge variant="secondary">{t("default")}</Badge> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[
                    tr.relation,
                    tr.gender ? t(`genders.${tr.gender}`) : null,
                    tr.dateOfBirth ? dateFormat.format(new Date(`${tr.dateOfBirth}T00:00:00Z`)) : null,
                    tr.phone,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {!tr.isDefault ? (
                  <Button
                    variant="ghost"
                    size="default"
                    disabled={pending}
                    onClick={() => run(() => setDefaultTraveller({ id: tr.id }), t("saved"))}
                  >
                    <Star /> {t("makeDefault")}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("editNamed", { name: tr.fullName })}
                  onClick={() => setEditing(tr.id)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("deleteNamed", { name: tr.fullName })}
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(t("deleteConfirm", { name: tr.fullName }))) {
                      run(() => deleteTraveller({ id: tr.id }), t("deleted"));
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
