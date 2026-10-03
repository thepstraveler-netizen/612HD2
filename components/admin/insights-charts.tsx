"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPaise } from "@/lib/money";
import { compactRupees, formatDayShort } from "@/lib/reports/format";

/**
 * Recharts charts for the admin dashboard and reports. Loaded lazily through
 * insights-charts-lazy.tsx so Recharts stays out of the main admin bundle.
 * One measure per chart (never two y-axes); labels and numbers come in
 * already translated, and each chart has a table next to it on the page.
 */

export type TrendPoint = { day: string; bookings: number; revenue_paise: number };
export type BarPoint = { label: string; value: number };
export type TrendLabels = { revenue: string; bookings: string; metric: string };

const AXIS = { fontSize: 12, fill: "var(--muted-foreground)" };
const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--foreground)",
  fontSize: 13,
};

export function TrendChart({
  points,
  locale,
  labels,
}: {
  points: TrendPoint[];
  locale: string;
  labels: TrendLabels;
}) {
  const [metric, setMetric] = useState<"revenue_paise" | "bookings">("revenue_paise");
  const isMoney = metric === "revenue_paise";
  const format = (v: number) =>
    isMoney ? formatPaise(v, locale) : v.toLocaleString(locale === "hi" ? "hi-IN" : "en-IN");
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label={labels.metric} className="flex gap-1">
        {(
          [
            ["revenue_paise", labels.revenue],
            ["bookings", labels.bookings],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={metric === key}
            onClick={() => setMetric(key)}
            className={
              metric === key
                ? "min-h-9 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground"
                : "min-h-9 rounded-full border bg-card px-3 text-sm font-medium hover:bg-accent"
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="day"
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tickFormatter={(d: string) => formatDayShort(d, locale)}
            />
            <YAxis
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={56}
              allowDecimals={false}
              tickFormatter={(v: number) => (isMoney ? compactRupees(v, locale) : String(v))}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(d) => formatDayShort(String(d), locale)}
              formatter={(v) => [format(Number(v)), isMoney ? labels.revenue : labels.bookings]}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#trend-fill)"
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function HorizontalBarChart({
  points,
  locale,
  money,
  valueLabel,
}: {
  points: BarPoint[];
  locale: string;
  money: boolean;
  valueLabel: string;
}) {
  const format = (v: number) =>
    money ? formatPaise(v, locale) : v.toLocaleString(locale === "hi" ? "hi-IN" : "en-IN");
  return (
    <div className="w-full" style={{ height: Math.max(120, points.length * 40 + 24) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(v: number) => (money ? compactRupees(v, locale) : String(v))}
          />
          <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={96} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={tooltipStyle}
            formatter={(v) => [format(Number(v)), valueLabel]}
          />
          <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
