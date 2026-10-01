"use client";

import { Bike, Building2, Car, Map, Plane, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type TabKey = "hotels" | "cabs" | "rides" | "packages" | "travel";

/**
 * Tabbed search card (hero). Each tab has its own fields; the query string it
 * builds is what the listing pages read (hotels since phase 3, cabs in phase 5,
 * …). Until a listing exists, the tab's target is that service's page.
 */
const TARGET: Record<TabKey, string> = {
  hotels: "/hotels",
  cabs: "/services/car",
  rides: "/services/rickshaw",
  packages: "/services/travel-hotel-booking",
  travel: "/services/travel-agent",
};

const ICON = { hotels: Building2, cabs: Car, rides: Bike, packages: Map, travel: Plane } as const;

const today = () => new Date().toISOString().slice(0, 10);

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</Label>
      {children}
    </div>
  );
}

function Select({ name, options, label }: { name: string; options: [string, string][]; label: string }) {
  return (
    <select
      name={name}
      aria-label={label}
      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:text-sm"
    >
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );
}

export function SearchCard({ tabs }: { tabs: TabKey[] }) {
  const t = useTranslations("search");
  const router = useRouter();
  const [active, setActive] = useState<TabKey>(tabs[0] ?? "hotels");

  const onSubmit = (tab: TabKey) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    const query = params.toString();
    router.push(`${TARGET[tab]}${query ? `?${query}` : ""}`);
  };

  if (tabs.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-3 shadow-lg sm:p-5">
      <Tabs value={active} onValueChange={(v) => setActive(v as TabKey)}>
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
          {tabs.map((tab) => {
            const Icon = ICON[tab];
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                className="min-h-11 flex-col gap-1 px-3 text-xs data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground sm:flex-row sm:text-sm"
              >
                <Icon className="size-5" aria-hidden="true" />
                {t(`tabs.${tab}`)}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="hotels">
          <form
            onSubmit={onSubmit("hotels")}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.2fr_auto] lg:items-end"
          >
            <Field label={t("destination")}>
              <Input name="q" placeholder="Vrindavan" autoComplete="off" />
            </Field>
            <Field label={t("checkIn")}>
              <Input name="checkin" type="date" min={today()} />
            </Field>
            <Field label={t("checkOut")}>
              <Input name="checkout" type="date" min={today()} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("rooms")}>
                <Input name="rooms" type="number" min={1} max={8} defaultValue={1} inputMode="numeric" />
              </Field>
              <Field label={t("adults")}>
                <Input name="adults" type="number" min={1} max={30} defaultValue={2} inputMode="numeric" />
              </Field>
            </div>
            <SubmitButton label={t("submit")} />
          </form>
        </TabsContent>

        <TabsContent value="cabs">
          <form
            onSubmit={onSubmit("cabs")}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1.4fr_1fr_1fr_auto] lg:items-end"
          >
            <Field label={t("tripType")}>
              <Select
                name="trip"
                label={t("tripType")}
                options={[
                  ["oneway", t("tripOneWay")],
                  ["round", t("tripRound")],
                  ["local", t("tripLocal")],
                  ["airport", t("tripAirport")],
                ]}
              />
            </Field>
            <Field label={t("from")}>
              <Input name="from" placeholder="Mathura Junction" autoComplete="off" />
            </Field>
            <Field label={t("to")}>
              <Input name="to" placeholder="Vrindavan" autoComplete="off" />
            </Field>
            <Field label={t("date")}>
              <Input name="date" type="date" min={today()} />
            </Field>
            <Field label={t("time")}>
              <Input name="time" type="time" />
            </Field>
            <SubmitButton label={t("submit")} />
          </form>
        </TabsContent>

        <TabsContent value="rides">
          <form
            onSubmit={onSubmit("rides")}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1.5fr_1fr_auto] lg:items-end"
          >
            <Field label={t("vehicle")}>
              <Select
                name="vehicle"
                label={t("vehicle")}
                options={[
                  ["rickshaw", t("vehicleRickshaw")],
                  ["bike", t("vehicleBike")],
                  ["car", t("vehicleCar")],
                ]}
              />
            </Field>
            <Field label={t("from")}>
              <Input name="from" placeholder="Prem Mandir" autoComplete="off" />
            </Field>
            <Field label={t("to")}>
              <Input name="to" placeholder="Banke Bihari" autoComplete="off" />
            </Field>
            <Field label={t("time")}>
              <Input name="time" type="time" />
            </Field>
            <SubmitButton label={t("submit")} />
          </form>
        </TabsContent>

        <TabsContent value="packages">
          <form
            onSubmit={onSubmit("packages")}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end"
          >
            <Field label={t("destination")}>
              <Input name="q" placeholder="Braj 84 Kos" autoComplete="off" />
            </Field>
            <Field label={t("month")}>
              <Input name="month" type="month" />
            </Field>
            <Field label={t("guests")}>
              <Input name="guests" type="number" min={1} max={60} defaultValue={2} inputMode="numeric" />
            </Field>
            <SubmitButton label={t("submit")} />
          </form>
        </TabsContent>

        <TabsContent value="travel">
          <form
            onSubmit={onSubmit("travel")}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1.4fr_1fr_auto] lg:items-end"
          >
            <Field label={t("mode")}>
              <Select
                name="mode"
                label={t("mode")}
                options={[
                  ["train", t("modeTrain")],
                  ["flight", t("modeFlight")],
                  ["bus", t("modeBus")],
                ]}
              />
            </Field>
            <Field label={t("from")}>
              <Input name="from" placeholder="Delhi" autoComplete="off" />
            </Field>
            <Field label={t("to")}>
              <Input name="to" placeholder="Mathura" autoComplete="off" />
            </Field>
            <Field label={t("date")}>
              <Input name="date" type="date" min={today()} />
            </Field>
            <SubmitButton label={t("submitEnquiry")} />
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  return (
    <Button type="submit" size="lg" className="w-full sm:col-span-2 lg:col-span-1 lg:w-auto">
      <Search /> {label}
    </Button>
  );
}
