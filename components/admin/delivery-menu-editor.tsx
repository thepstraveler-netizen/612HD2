"use client";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Pencil, Plus, Save, Star } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";
import {
  FormProvider,
  useForm,
  type FieldError,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { AdminMenu } from "@/lib/delivery/admin";
import {
  deleteAddon,
  deleteAddonGroup,
  deleteCategory,
  deleteItem,
  deleteVariant,
  registerDeliveryMedia,
  saveAddon,
  saveAddonGroup,
  saveCategory,
  saveItem,
  saveVariant,
  setItemAvailable,
  setItemStock,
} from "@/lib/delivery/admin-actions";
import {
  addonFormValues,
  addonGroupFormValues,
  categoryFormValues,
  itemFormValues,
  newAddonGroupValues,
  newAddonValues,
  newCategoryValues,
  newItemValues,
  newVariantValues,
  variantFormValues,
} from "@/lib/delivery/admin-rows";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { StoreKind } from "@/schemas/delivery";
import {
  DIETS,
  addonFormSchema,
  addonGroupFormSchema,
  categoryFormSchema,
  itemFormSchema,
  variantFormSchema,
  type AddonFormInput,
  type AddonGroupFormInput,
  type CategoryFormInput,
  type ItemFormInput,
  type VariantFormInput,
} from "@/schemas/delivery-admin";
import { DeliveryDeleteButton, useDeliveryAction, useDeliverySave } from "./delivery-shared";
import { LocalizedField, SelectField, SwitchField, TextInputField } from "./form-fields";
import { FormSection } from "./hotel-shared";
import { ImageUploader } from "./image-uploader";

/**
 * A store's menu: categories, items with quick sold-out and stock
 * controls, and per item its variants (sizes) and add-on groups. Every
 * row saves on its own; the server re-validates and the shop cache clears.
 */

type MenuItemRow = AdminMenu["items"][number];

const DIET_DOT: Record<(typeof DIETS)[number], string> = {
  veg: "border-accent-green text-accent-green",
  egg: "border-accent-amber text-accent-amber",
  non_veg: "border-destructive text-destructive",
  na: "border-muted-foreground text-muted-foreground",
};

/** Field error text (zod messages are keys under cms.errors). */
function useErrorText() {
  const t = useTranslations("cms.errors");
  return (error: FieldError | undefined) => {
    const message = error?.message;
    if (!message) return undefined;
    return t.has(message) ? t(message) : message;
  };
}

function fieldError<T extends FieldValues>(form: UseFormReturn<T>, name: string): FieldError | undefined {
  return name
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc as Record<string, unknown> | undefined)?.[part],
      form.formState.errors,
    ) as FieldError | undefined;
}

/** A compact labelled input for the row editors (ids are unique per row). */
function MiniField<T extends FieldValues>({
  form,
  name,
  label,
  idPrefix,
  className,
  ...input
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  idPrefix: string;
  className?: string;
} & Omit<ComponentProps<typeof Input>, "form" | "name" | "id">) {
  const errorText = useErrorText();
  const message = errorText(fieldError(form, name));
  const id = `${idPrefix}-${name}`;
  return (
    <div className={cn("grid gap-1", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} aria-invalid={!!message} className="h-9" {...input} {...form.register(name)} />
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}

function MiniSwitch<T extends FieldValues>({
  form,
  name,
  label,
  idPrefix,
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${name}`;
  const checked = Boolean(form.watch(name));
  return (
    <div className="flex min-h-9 items-center gap-2">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(v) => form.setValue(name, v as T[Path<T>], { shouldDirty: true })}
      />
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
    </div>
  );
}

// ---------------------------------------------------------------- categories

function CategoryRow({ values, isNew }: { values: CategoryFormInput; isNew?: boolean }) {
  const t = useTranslations("deliveryAdmin");
  const form = useForm<CategoryFormInput>({
    resolver: zodResolver(categoryFormSchema, undefined, { raw: true }),
    defaultValues: values,
  });
  const { pending, onSubmit } = useDeliverySave(form, saveCategory, {
    isNew: false,
    onSaved: () => {
      if (isNew) form.reset(values);
    },
  });
  const prefix = `cat-${values.id ?? "new"}`;
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid items-end gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_6rem_auto_auto]"
    >
      <MiniField form={form} name="name.en" label={t("fields.nameEn")} idPrefix={prefix} />
      <MiniField form={form} name="name.hi" label={t("fields.nameHi")} idPrefix={prefix} lang="hi" />
      <MiniField
        form={form}
        name="sort_order"
        label={t("fields.sortOrder")}
        idPrefix={prefix}
        type="number"
      />
      <MiniSwitch form={form} name="is_active" label={t("fields.active")} idPrefix={prefix} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {isNew ? <Plus /> : <Save />} {isNew ? t("menu.addCategory") : t("menu.save")}
        </Button>
        {values.id ? (
          <DeliveryDeleteButton
            id={values.id}
            action={deleteCategory}
            size="sm"
            confirmText={t("menu.confirmDeleteCategory")}
          />
        ) : null}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- variants and add-ons

function VariantRow({ values, isNew }: { values: VariantFormInput; isNew?: boolean }) {
  const t = useTranslations("deliveryAdmin");
  const form = useForm<VariantFormInput>({
    resolver: zodResolver(variantFormSchema, undefined, { raw: true }),
    defaultValues: values,
  });
  const { pending, onSubmit } = useDeliverySave(form, saveVariant, {
    isNew: false,
    onSaved: () => {
      if (isNew) form.reset(values);
    },
  });
  const prefix = `var-${values.id ?? `new-${values.item_id}`}`;
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid items-end gap-2 rounded-xl border p-3 sm:grid-cols-4"
    >
      <MiniField form={form} name="name.en" label={t("fields.nameEn")} idPrefix={prefix} placeholder="Half" />
      <MiniField form={form} name="name.hi" label={t("fields.nameHi")} idPrefix={prefix} lang="hi" />
      <MiniField form={form} name="price" label={t("menu.priceRs")} idPrefix={prefix} inputMode="decimal" />
      <MiniField
        form={form}
        name="stock"
        label={t("menu.stockOptional")}
        idPrefix={prefix}
        inputMode="numeric"
      />
      <MiniField
        form={form}
        name="sort_order"
        label={t("fields.sortOrder")}
        idPrefix={prefix}
        type="number"
      />
      <MiniSwitch form={form} name="is_available" label={t("menu.available")} idPrefix={prefix} />
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {isNew ? <Plus /> : <Save />} {isNew ? t("menu.addVariant") : t("menu.save")}
        </Button>
        {values.id ? <DeliveryDeleteButton id={values.id} action={deleteVariant} size="sm" /> : null}
      </div>
    </form>
  );
}

function AddonRow({ values, isNew }: { values: AddonFormInput; isNew?: boolean }) {
  const t = useTranslations("deliveryAdmin");
  const form = useForm<AddonFormInput>({
    resolver: zodResolver(addonFormSchema, undefined, { raw: true }),
    defaultValues: values,
  });
  const { pending, onSubmit } = useDeliverySave(form, saveAddon, {
    isNew: false,
    onSaved: () => {
      if (isNew) form.reset(values);
    },
  });
  const prefix = `add-${values.id ?? `new-${values.group_id}`}`;
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_6rem_5rem_auto_auto]"
    >
      <MiniField
        form={form}
        name="name.en"
        label={t("fields.nameEn")}
        idPrefix={prefix}
        placeholder="Extra butter"
      />
      <MiniField form={form} name="name.hi" label={t("fields.nameHi")} idPrefix={prefix} lang="hi" />
      <MiniField form={form} name="price" label={t("menu.priceRs")} idPrefix={prefix} inputMode="decimal" />
      <MiniField
        form={form}
        name="sort_order"
        label={t("fields.sortOrder")}
        idPrefix={prefix}
        type="number"
      />
      <MiniSwitch form={form} name="is_available" label={t("menu.available")} idPrefix={prefix} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant={isNew ? "outline" : "default"} disabled={pending}>
          {isNew ? <Plus /> : <Save />} {isNew ? t("menu.addAddon") : t("menu.save")}
        </Button>
        {values.id ? <DeliveryDeleteButton id={values.id} action={deleteAddon} size="sm" /> : null}
      </div>
    </form>
  );
}

function AddonGroupBlock({
  values,
  addons,
  isNew,
}: {
  values: AddonGroupFormInput;
  addons: AdminMenu["addons"];
  isNew?: boolean;
}) {
  const t = useTranslations("deliveryAdmin");
  const form = useForm<AddonGroupFormInput>({
    resolver: zodResolver(addonGroupFormSchema, undefined, { raw: true }),
    defaultValues: values,
  });
  const { pending, onSubmit } = useDeliverySave(form, saveAddonGroup, {
    isNew: false,
    onSaved: () => {
      if (isNew) form.reset(values);
    },
  });
  const prefix = `grp-${values.id ?? `new-${values.item_id}`}`;
  return (
    <div className="grid gap-3 rounded-xl border p-3">
      <form
        onSubmit={onSubmit}
        noValidate
        className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_5rem_5rem_5rem]"
      >
        <MiniField
          form={form}
          name="name.en"
          label={t("fields.nameEn")}
          idPrefix={prefix}
          placeholder="Extras"
        />
        <MiniField form={form} name="name.hi" label={t("fields.nameHi")} idPrefix={prefix} lang="hi" />
        <MiniField
          form={form}
          name="min_select"
          label={t("menu.minSelect")}
          idPrefix={prefix}
          type="number"
        />
        <MiniField
          form={form}
          name="max_select"
          label={t("menu.maxSelect")}
          idPrefix={prefix}
          type="number"
        />
        <MiniField
          form={form}
          name="sort_order"
          label={t("fields.sortOrder")}
          idPrefix={prefix}
          type="number"
        />
        <div className="flex gap-2 sm:col-span-5">
          <Button type="submit" size="sm" disabled={pending}>
            {isNew ? <Plus /> : <Save />} {isNew ? t("menu.addGroup") : t("menu.saveGroup")}
          </Button>
          {values.id ? (
            <DeliveryDeleteButton
              id={values.id}
              action={deleteAddonGroup}
              size="sm"
              confirmText={t("menu.confirmDeleteGroup")}
            />
          ) : null}
        </div>
      </form>
      {values.id ? (
        <div className="grid gap-2 border-t pt-3">
          {addons.map((a) => (
            <AddonRow key={a.id} values={addonFormValues(a)} />
          ))}
          <AddonRow values={newAddonValues(values.id)} isNew />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- item sheet

function ItemForm({
  values,
  imageUrl,
  categories,
  onCreated,
}: {
  values: ItemFormInput;
  imageUrl: string | null;
  categories: { value: string; label: string }[];
  onCreated: (id: string | undefined) => void;
}) {
  const t = useTranslations("deliveryAdmin");
  const form = useForm<ItemFormInput>({
    resolver: zodResolver(itemFormSchema, undefined, { raw: true }),
    defaultValues: values,
  });
  const isNew = !values.id;
  const { pending, onSubmit } = useDeliverySave(form, saveItem, {
    isNew: false,
    onSaved: (id) => {
      if (isNew) onCreated(id);
    },
  });
  const [preview, setPreview] = useState(imageUrl);
  const imageId = form.watch("image_id");
  const name = form.watch("name");
  const trackStock = form.watch("track_stock");

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <LocalizedField<ItemFormInput> name="name" label={t("fields.name")} />
        <LocalizedField<ItemFormInput> name="description" label={t("fields.description")} multiline />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField<ItemFormInput>
            name="category_id"
            label={t("menu.category")}
            options={[{ value: "", label: t("menu.uncategorised") }, ...categories]}
          />
          <SelectField<ItemFormInput>
            name="diet"
            label={t("menu.diet")}
            options={DIETS.map((d) => ({ value: d, label: t(`diets.${d}`) }))}
          />
          <TextInputField<ItemFormInput> name="price" label={t("menu.priceRs")} />
          <TextInputField<ItemFormInput> name="mrp" label={t("menu.mrp")} help={t("menu.mrpHelp")} />
          <TextInputField<ItemFormInput> name="gst_percent" label={t("menu.gst")} help={t("menu.gstHelp")} />
          <TextInputField<ItemFormInput> name="hsn" label={t("menu.hsn")} placeholder="2106" />
          <TextInputField<ItemFormInput> name="unit" label={t("menu.unit")} placeholder="500 g" />
          <TextInputField<ItemFormInput> name="sort_order" label={t("fields.sortOrder")} type="number" />
        </div>
        <p className="text-xs text-muted-foreground">{t("menu.dietHelp")}</p>
        <div className="flex flex-wrap gap-x-6">
          <SwitchField<ItemFormInput> name="is_jain" label={t("menu.jain")} />
          <SwitchField<ItemFormInput> name="is_sattvik" label={t("menu.sattvik")} />
          <SwitchField<ItemFormInput> name="is_bestseller" label={t("menu.bestseller")} />
          <SwitchField<ItemFormInput> name="is_available" label={t("menu.available")} />
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <SwitchField<ItemFormInput> name="track_stock" label={t("menu.trackStock")} />
          {trackStock ? (
            <TextInputField<ItemFormInput> name="stock" label={t("menu.stock")} className="w-32" />
          ) : null}
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">{t("fields.image")}</span>
          <ImageUploader
            value={imageId}
            previewUrl={preview}
            collection="store-items"
            alt={{ en: name?.en || "Item", hi: name?.hi || null }}
            register={registerDeliveryMedia}
            onChange={(id, url) => {
              form.setValue("image_id", id ?? "", { shouldDirty: true });
              setPreview(url);
            }}
          />
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          {values.id ? (
            <DeliveryDeleteButton
              id={values.id}
              action={deleteItem}
              confirmText={t("menu.confirmDeleteItem")}
            />
          ) : (
            <span />
          )}
          <Button type="submit" disabled={pending}>
            {isNew ? t("menu.createItem") : t("menu.saveItem")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

// ---------------------------------------------------------------- item list

function ItemListRow({ item, onEdit }: { item: MenuItemRow; onEdit: () => void }) {
  const t = useTranslations("deliveryAdmin");
  const locale = useLocale();
  const { pending, run } = useDeliveryAction();
  const [stock, setStock] = useState(item.stock === null ? "" : String(item.stock));
  return (
    <li className="grid items-center gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[3rem_1fr_auto]">
      <div className="relative hidden size-12 overflow-hidden rounded-lg bg-muted sm:block">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt="" fill sizes="3rem" className="object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <span
            className={cn(
              "inline-flex size-3.5 items-center justify-center rounded-sm border-2",
              DIET_DOT[item.diet],
            )}
            title={t(`diets.${item.diet}`)}
          >
            <span className="size-1.5 rounded-full bg-current" />
          </span>
          {pickLocalized(item.name, locale)}
          {item.is_bestseller ? (
            <Badge variant="secondary" className="gap-1">
              <Star className="size-3" aria-hidden="true" /> {t("menu.bestseller")}
            </Badge>
          ) : null}
          {item.is_jain ? <Badge variant="outline">{t("menu.jain")}</Badge> : null}
          {item.is_sattvik ? <Badge variant="outline">{t("menu.sattvik")}</Badge> : null}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatPaise(item.price_paise, locale)}
          {item.mrp_paise && item.mrp_paise > item.price_paise ? (
            <span className="ml-1 line-through">{formatPaise(item.mrp_paise, locale)}</span>
          ) : null}
          {item.unit ? ` · ${item.unit}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {item.track_stock ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^\d+$/.test(stock.trim())) return;
              run(() => setItemStock({ id: item.id, stock: Number(stock) }));
            }}
          >
            <Label htmlFor={`stock-${item.id}`} className="text-xs text-muted-foreground">
              {t("menu.stock")}
            </Label>
            <Input
              id={`stock-${item.id}`}
              value={stock}
              inputMode="numeric"
              onChange={(e) => setStock(e.target.value)}
              className="h-9 w-20"
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              aria-label={t("menu.saveStock")}
              disabled={pending}
            >
              <Save />
            </Button>
          </form>
        ) : null}
        <div className="flex items-center gap-2">
          <Switch
            id={`avail-${item.id}`}
            checked={item.is_available}
            disabled={pending}
            onCheckedChange={(v) =>
              run(
                () => setItemAvailable({ id: item.id, is_available: v }),
                v ? t("menu.nowAvailable") : t("menu.nowSoldOut"),
              )
            }
          />
          <Label htmlFor={`avail-${item.id}`} className="text-sm">
            {item.is_available ? t("menu.available") : t("menu.soldOut")}
          </Label>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          <Pencil /> {t("menu.edit")}
        </Button>
      </div>
    </li>
  );
}

export function DeliveryMenuEditor({
  storeId,
  kind,
  menu,
}: {
  storeId: string;
  kind: StoreKind;
  menu: AdminMenu;
}) {
  const t = useTranslations("deliveryAdmin");
  const locale = useLocale();
  const [filter, setFilter] = useState<string>("all");
  // The open sheet: an item id, "new", or null. A just-created item opens for its variants.
  const [editing, setEditing] = useState<string | null>(null);
  const categoryOptions = menu.categories.map((c) => ({ value: c.id, label: pickLocalized(c.name, locale) }));
  const nextSort = (menu.categories.at(-1)?.sort_order ?? 0) + 10;
  const editingItem = editing && editing !== "new" ? menu.items.find((i) => i.id === editing) : undefined;

  const sections = [
    ...menu.categories.map((c) => ({
      id: c.id,
      title: pickLocalized(c.name, locale),
      inactive: !c.is_active,
    })),
    { id: "", title: t("menu.uncategorised"), inactive: false },
  ]
    .filter((s) => filter === "all" || filter === s.id)
    .map((s) => ({ ...s, items: menu.items.filter((i) => (i.category_id ?? "") === s.id) }))
    .filter((s) => s.items.length > 0 || (filter !== "all" && s.id !== ""));

  return (
    <div className="grid gap-5">
      <FormSection title={t("menu.categories")}>
        <p className="text-sm text-muted-foreground">{t("menu.categoriesLead")}</p>
        {menu.categories.map((c) => (
          <CategoryRow key={c.id} values={categoryFormValues(c)} />
        ))}
        <CategoryRow values={newCategoryValues(storeId, nextSort)} isNew />
      </FormSection>

      <FormSection title={t("menu.items")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="menu-filter">{t("menu.showCategory")}</Label>
            <NativeSelect id="menu-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">{t("menu.allCategories")}</option>
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              <option value="">{t("menu.uncategorised")}</option>
            </NativeSelect>
          </div>
          <Button type="button" onClick={() => setEditing("new")}>
            <Plus /> {t("menu.newItem")}
          </Button>
        </div>
        {menu.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("menu.noItems")}</p>
        ) : null}
        {sections.map((s) => (
          <section key={s.id || "none"} className="grid gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {s.title}
              <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
                {s.items.length}
              </span>
              {s.inactive ? <Badge variant="outline">{t("menu.hidden")}</Badge> : null}
            </h3>
            <ul className="grid gap-2">
              {s.items.map((item) => (
                <ItemListRow key={item.id} item={item} onEdit={() => setEditing(item.id)} />
              ))}
            </ul>
          </section>
        ))}
      </FormSection>

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
          <SheetHeader className="pr-10">
            <SheetTitle>
              {editingItem ? pickLocalized(editingItem.name, locale) : t("menu.newItemTitle")}
            </SheetTitle>
            <SheetDescription>{t("menu.itemLead")}</SheetDescription>
          </SheetHeader>
          {editing !== null && editing !== "new" && !editingItem ? (
            <p className="text-sm text-muted-foreground">{t("menu.loading")}</p>
          ) : editing !== null ? (
            <div className="grid gap-6">
              <ItemForm
                key={editingItem?.id ?? "new"}
                values={
                  editingItem
                    ? itemFormValues(editingItem)
                    : newItemValues(storeId, filter !== "all" && filter ? filter : null, kind)
                }
                imageUrl={editingItem?.imageUrl ?? null}
                categories={categoryOptions}
                onCreated={(id) => setEditing(id ?? null)}
              />
              {editingItem ? (
                <>
                  <section className="grid gap-2">
                    <h3 className="text-base font-semibold">{t("menu.variants")}</h3>
                    <p className="text-xs text-muted-foreground">{t("menu.variantsLead")}</p>
                    {menu.variants
                      .filter((v) => v.item_id === editingItem.id)
                      .map((v) => (
                        <VariantRow key={v.id} values={variantFormValues(v)} />
                      ))}
                    <VariantRow values={newVariantValues(editingItem.id)} isNew />
                  </section>
                  <section className="grid gap-2">
                    <h3 className="text-base font-semibold">{t("menu.addonGroups")}</h3>
                    <p className="text-xs text-muted-foreground">{t("menu.addonGroupsLead")}</p>
                    {menu.groups
                      .filter((g) => g.item_id === editingItem.id)
                      .map((g) => (
                        <AddonGroupBlock
                          key={g.id}
                          values={addonGroupFormValues(g)}
                          addons={menu.addons.filter((a) => a.group_id === g.id)}
                        />
                      ))}
                    <AddonGroupBlock values={newAddonGroupValues(editingItem.id)} addons={[]} isNew />
                  </section>
                </>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
