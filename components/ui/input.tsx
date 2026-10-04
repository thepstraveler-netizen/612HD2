import * as React from "react";
import { cn } from "@/lib/utils";

/** Native date/time pickers, whose fixed-width text and picker icon clip in narrow (two-up) phone columns. */
const DATE_LIKE = new Set(["date", "time", "datetime-local", "month", "week"]);

/** lucide "calendar" and "clock" in a mid grey that reads on both themes. */
const svg = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#7d8aa5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  )}")`;
const CALENDAR_ICON = svg(
  '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
);
const CLOCK_ICON = svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>');

function Input({ className, type, style, ...props }: React.ComponentProps<"input">) {
  const dateLike = type !== undefined && DATE_LIKE.has(type);
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3.5 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        // Phones: a small drawn icon replaces the native one, and the (invisible) native picker
        // button covers the whole field, so the text keeps its room and any tap opens the picker.
        dateLike &&
          "max-sm:relative max-sm:bg-(image:--input-icon) max-sm:bg-size-[1rem] max-sm:bg-position-[right_0.625rem_center] max-sm:bg-no-repeat max-sm:ps-2.5 max-sm:pe-8 max-sm:[&::-webkit-calendar-picker-indicator]:absolute max-sm:[&::-webkit-calendar-picker-indicator]:inset-0 max-sm:[&::-webkit-calendar-picker-indicator]:m-0 max-sm:[&::-webkit-calendar-picker-indicator]:h-auto max-sm:[&::-webkit-calendar-picker-indicator]:w-auto max-sm:[&::-webkit-calendar-picker-indicator]:p-0 max-sm:[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-date-and-time-value]:text-start [&::-webkit-datetime-edit]:overflow-hidden",
        className,
      )}
      style={
        dateLike
          ? ({
              "--input-icon": type === "time" ? CLOCK_ICON : CALENDAR_ICON,
              ...style,
            } as React.CSSProperties)
          : style
      }
      {...props}
    />
  );
}

export { Input };
