"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { applyCalendarEdit } from "@/lib/hotels/actions";
import { calendarEditSchema, type CalendarEditInput } from "@/schemas/hotels";
import { SelectField, TextInputField } from "./form-fields";
import { useHotelSave, WeekdayToggles } from "./hotel-shared";

type PriceMode = "keep" | "set" | "clear";

/** Bulk edit for one room over a date range (optionally only some weekdays). */
export function CalendarEditForm({
  hotelId,
  roomId,
  plans,
  defaultStart,
  defaultEnd,
}: {
  hotelId: string;
  roomId: string;
  plans: { value: string; label: string }[];
  defaultStart: string;
  defaultEnd: string;
}) {
  const t = useTranslations("hotelsAdmin.calendar");
  const form = useForm<CalendarEditInput>({
    resolver: zodResolver(calendarEditSchema, undefined, { raw: true }),
    defaultValues: {
      hotel_id: hotelId,
      room_id: roomId,
      start: defaultStart,
      end: defaultEnd,
      weekdays: [],
      availability: "keep",
      units: "",
      min_stay: "",
      rate_plan_id: plans[0]?.value ?? "",
      price: "",
      clear_price: false,
    },
  });
  const [priceMode, setPriceMode] = useState<PriceMode>("keep");
  const { pending, onSubmit } = useHotelSave(form, applyCalendarEdit, {
    isNew: false,
    keepValues: true,
    transform: (v) => ({
      ...v,
      price: priceMode === "set" ? v.price : "",
      clear_price: priceMode === "clear",
      rate_plan_id: priceMode === "keep" ? "" : v.rate_plan_id,
    }),
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border bg-card p-4" noValidate>
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{t("editTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("editLead")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextInputField<CalendarEditInput> name="start" label={t("start")} type="date" />
          <TextInputField<CalendarEditInput> name="end" label={t("end")} type="date" />
        </div>
        <WeekdayToggles<CalendarEditInput> name="weekdays" label={t("weekdays")} />
        <SelectField<CalendarEditInput>
          name="availability"
          label={t("availability")}
          options={[
            { value: "keep", label: t("keep") },
            { value: "open", label: t("open") },
            { value: "close", label: t("close") },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextInputField<CalendarEditInput> name="units" label={t("units")} help={t("unitsHelp")} />
          <TextInputField<CalendarEditInput> name="min_stay" label={t("minStay")} help={t("keepHelp")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="f-price-mode">{t("priceAction")}</Label>
          <NativeSelect
            id="f-price-mode"
            value={priceMode}
            onChange={(e) => setPriceMode(e.target.value as PriceMode)}
            disabled={plans.length === 0}
          >
            <option value="keep">{t("priceKeep")}</option>
            <option value="set">{t("priceSet")}</option>
            <option value="clear">{t("priceClear")}</option>
          </NativeSelect>
        </div>
        {priceMode !== "keep" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField<CalendarEditInput> name="rate_plan_id" label={t("plan")} options={plans} />
            {priceMode === "set" ? (
              <TextInputField<CalendarEditInput> name="price" label={t("price")} help={t("priceHelp")} />
            ) : null}
          </div>
        ) : null}
        <Button type="submit" disabled={pending}>
          {t("apply")}
        </Button>
      </form>
    </FormProvider>
  );
}
