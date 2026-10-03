"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
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
import { deleteAddress, saveAddress } from "@/lib/delivery/actions";
import { savedAddressSchema, type SavedAddressInput } from "@/schemas/delivery";

export type BookAddress = {
  id: string;
  label: string;
  contactName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  pincode: string;
  zoneId: string | null;
  isDefault: boolean;
};

export type ZoneOption = { id: string; name: string };

const toInput = (a: BookAddress | null, zones: ZoneOption[]): SavedAddressInput => ({
  label: a?.label ?? "Home",
  contactName: a?.contactName ?? "",
  phone: a?.phone ?? "",
  line1: a?.line1 ?? "",
  line2: a?.line2 ?? "",
  landmark: a?.landmark ?? "",
  pincode: a?.pincode ?? "",
  zoneId: a?.zoneId ?? (zones.length === 1 ? zones[0].id : ""),
  isDefault: a?.isDefault ?? false,
});

const TEXT_FIELDS = [
  { name: "label", autoComplete: "off", span: false },
  { name: "contactName", autoComplete: "name", span: false },
  { name: "phone", autoComplete: "tel", span: false },
  { name: "line1", autoComplete: "address-line1", span: true },
  { name: "line2", autoComplete: "address-line2", span: true },
  { name: "landmark", autoComplete: "off", span: false },
  { name: "pincode", autoComplete: "postal-code", span: false },
] as const;

function AddressForm({
  address,
  zones,
  onDone,
}: {
  address: BookAddress | null;
  zones: ZoneOption[];
  onDone: () => void;
}) {
  const t = useTranslations("account.addresses");
  const te = useTranslations("account.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<SavedAddressInput>({
    resolver: zodResolver(savedAddressSchema, undefined, { raw: true }),
    defaultValues: toInput(address, zones),
  });
  const errorText = (key: string) => (te.has(key) ? te(key) : te("generic"));

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveAddress({ ...values, id: address?.id });
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
        <h2 className="text-base font-bold sm:col-span-2">{address ? t("edit") : t("add")}</h2>
        {TEXT_FIELDS.map(({ name, autoComplete, span }) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormItem className={span ? "sm:col-span-2" : undefined}>
                <FormLabel>{t(`fields.${name}`)}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete={autoComplete}
                    type={name === "phone" ? "tel" : "text"}
                    inputMode={name === "phone" ? "tel" : name === "pincode" ? "numeric" : undefined}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage translateKey={errorText} />
              </FormItem>
            )}
          />
        ))}
        <FormField
          control={form.control}
          name="zoneId"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>{t("fields.zone")}</FormLabel>
              <FormControl>
                <NativeSelect {...field} value={field.value ?? ""}>
                  <option value="">{t("fields.zonePick")}</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormControl>
              <FormMessage translateKey={() => te("zoneRequired")} />
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

/**
 * Address book over the Phase 7 `addresses` table. Saves through the same
 * server actions the food/essentials checkout uses.
 */
export function AddressBook({ addresses, zones }: { addresses: BookAddress[]; zones: ZoneOption[] }) {
  const t = useTranslations("account.addresses");
  const te = useTranslations("account.errors");
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));

  const remove = (a: BookAddress) => {
    if (!window.confirm(t("deleteConfirm", { label: a.label }))) return;
    startTransition(async () => {
      const result = await deleteAddress({ id: a.id });
      if (result.ok) {
        toast.success(t("deleted"));
        router.refresh();
      } else toast.error(te("generic"));
    });
  };

  const makeDefault = (a: BookAddress) =>
    startTransition(async () => {
      if (!a.zoneId) {
        setEditing(a.id);
        return;
      }
      const { id, ...rest } = a;
      const result = await saveAddress({ ...rest, id, isDefault: true, zoneId: a.zoneId });
      if (result.ok) {
        toast.success(t("saved"));
        router.refresh();
      } else toast.error(te("generic"));
    });

  return (
    <div className="space-y-4">
      {zones.length === 0 ? <p className="text-sm text-muted-foreground">{t("noZones")}</p> : null}
      {editing === "new" ? (
        <AddressForm address={null} zones={zones} onDone={() => setEditing(null)} />
      ) : zones.length ? (
        <Button onClick={() => setEditing("new")}>
          <Plus /> {t("add")}
        </Button>
      ) : null}
      {addresses.length === 0 && editing !== "new" ? (
        <EmptyState icon={MapPin} title={t("empty")} description={t("emptyBody")} />
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {addresses.map((a) =>
          editing === a.id ? (
            <li key={a.id} className="sm:col-span-2">
              <AddressForm address={a} zones={zones} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
              <div className="space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {a.label}
                  {a.isDefault ? <Badge variant="secondary">{t("default")}</Badge> : null}
                </p>
                <p className="text-sm">
                  {a.contactName} · {a.phone}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[a.line1, a.line2, a.landmark, a.zoneId ? zoneName.get(a.zoneId) : null, a.pincode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap gap-1">
                {!a.isDefault ? (
                  <Button variant="ghost" disabled={pending} onClick={() => makeDefault(a)}>
                    <Star /> {t("makeDefault")}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("editNamed", { label: a.label })}
                  onClick={() => setEditing(a.id)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("deleteNamed", { label: a.label })}
                  disabled={pending}
                  onClick={() => remove(a)}
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
