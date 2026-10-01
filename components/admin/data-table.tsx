"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Check, Eye, Minus, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ToneBadge, type Tone } from "@/components/admin/booking-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { missingTranslation, pickLocalized, type LocalizedJson } from "@/lib/i18n/localized";

/**
 * Serializable column spec, so Server Components can describe a table
 * without passing functions to the client.
 */
export type DataColumn = {
  key: string;
  header: string;
  kind?: "text" | "localized" | "boolean" | "badge" | "tone" | "number" | "date";
  sortable?: boolean;
};

type Row = Record<string, unknown> & { id: string };

/** Value of a `tone` column: a coloured status pill. */
export type ToneCell = { label: string; tone: Tone };

function cellText(value: unknown, kind: DataColumn["kind"], locale: string): string {
  if (value == null) return "";
  if (kind === "localized") return pickLocalized(value as LocalizedJson, locale);
  if (kind === "tone") return (value as ToneCell).label;
  return String(value);
}

/**
 * Admin table: sortable columns, quick search and pagination (TanStack
 * Table). CMS tables are small, so this runs client-side; large operational
 * tables (bookings, payments) switch to server-side pagination in phase 4.
 */
export function DataTable({
  rows,
  columns,
  editHref,
  editLabel,
  pageSize = 20,
}: {
  rows: Row[];
  columns: DataColumn[];
  /** Path prefix for the edit link; the row id is appended. */
  editHref?: string;
  /** Label for the row link when it opens a detail page rather than an edit form. */
  editLabel?: string;
  pageSize?: number;
}) {
  const t = useTranslations("cms");
  const locale = useLocale();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const tableColumns = useMemo<ColumnDef<Row>[]>(() => {
    const defs: ColumnDef<Row>[] = columns.map((col) => ({
      id: col.key,
      accessorFn: (row) => cellText(row[col.key], col.kind, locale),
      header: ({ column }) =>
        col.sortable === false ? (
          col.header
        ) : (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="inline-flex items-center gap-1 font-semibold"
          >
            {col.header}
            <ArrowUpDown className="size-3.5" aria-hidden="true" />
          </button>
        ),
      sortingFn:
        col.kind === "number"
          ? (a, b) => Number(a.original[col.key]) - Number(b.original[col.key])
          : "alphanumeric",
      cell: ({ row }) => {
        const value = row.original[col.key];
        switch (col.kind) {
          case "boolean":
            return value ? (
              <Check className="size-4 text-accent-green" aria-label="yes" />
            ) : (
              <Minus className="size-4 text-muted-foreground" aria-label="no" />
            );
          case "badge":
            return value ? <Badge variant="secondary">{String(value)}</Badge> : null;
          case "tone":
            return value ? (
              <ToneBadge tone={(value as ToneCell).tone} label={(value as ToneCell).label} />
            ) : null;
          case "localized":
            return (
              <span className="flex items-center gap-2">
                {pickLocalized(value as LocalizedJson, locale)}
                {missingTranslation(value as LocalizedJson) ? (
                  <Badge variant="outline" className="text-[10px]" title={t("fields.missingHindi")}>
                    EN
                  </Badge>
                ) : null}
              </span>
            );
          case "date":
            return value ? new Date(String(value)).toLocaleDateString(locale) : "";
          default:
            return cellText(value, col.kind, locale);
        }
      },
    }));
    if (editHref) {
      defs.push({
        id: "actions",
        header: () => <span className="sr-only">{editLabel ?? t("actions.edit")}</span>,
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href={`${editHref}/${row.original.id}`}>
              {editLabel ? <Eye /> : <Pencil />} {editLabel ?? t("actions.edit")}
            </Link>
          </Button>
        ),
      });
    }
    return defs;
  }, [columns, editHref, editLabel, locale, t]);

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const pageCount = Math.max(table.getPageCount(), 1);

  return (
    <div className="space-y-3">
      <Input
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder={t("actions.search")}
        aria-label={t("actions.search")}
        className="max-w-xs"
      />
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={tableColumns.length} className="px-4 py-8 text-center text-muted-foreground">
                  {t("actions.noResults")}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            {t("actions.page", { page: table.getState().pagination.pageIndex + 1, pages: pageCount })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {t("actions.prev")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {t("actions.next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
