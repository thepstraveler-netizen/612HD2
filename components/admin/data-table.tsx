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
import { ArrowUpDown, Check, ChevronRight, Eye, Minus, Pencil, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { ToneBadge, type Tone } from "@/components/admin/booking-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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

/** True when a cell would render nothing, so the phone card can skip it. */
function isEmptyCell(value: unknown, kind: DataColumn["kind"], locale: string): boolean {
  if (kind === "boolean") return false;
  return cellText(value, kind, locale).trim() === "";
}

/**
 * Admin table: sortable columns, quick search and pagination (TanStack
 * Table). CMS tables are small, so this runs client-side; large operational
 * tables (bookings, payments) switch to server-side pagination in phase 4.
 *
 * Below `md` each row renders as a card (first column as the title, status
 * pills beside it, the rest as label/value pairs) and the whole card opens
 * `editHref`; the table itself is kept for wider screens.
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
  const tUi = useTranslations("admin.ui");
  const locale = useLocale();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const renderCell = useCallback(
    (col: DataColumn, value: unknown): ReactNode => {
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
            <span className="inline-flex items-center gap-2">
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
    [locale, t],
  );

  const tableColumns = useMemo<ColumnDef<Row>[]>(() => {
    const defs: ColumnDef<Row>[] = columns.map((col) => ({
      id: col.key,
      accessorFn: (row) => cellText(row[col.key], col.kind, locale),
      enableSorting: col.sortable !== false,
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
      cell: ({ row }) => renderCell(col, row.original[col.key]),
    }));
    if (editHref) {
      defs.push({
        id: "actions",
        enableSorting: false,
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
  }, [columns, editHref, editLabel, locale, renderCell, t]);

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
  const sortable = columns.filter((c) => c.sortable !== false);
  const sortValue = sorting[0] ? `${sorting[0].id}:${sorting[0].desc ? "desc" : "asc"}` : "";
  const [titleCol, ...restCols] = columns;
  // Status pills sit beside the card title; everything else becomes a label/value pair.
  const pillCols = restCols.filter((c) => c.kind === "tone");
  // Yes/no columns become a compact row of chips under the details.
  const flagCols = restCols.filter((c) => c.kind === "boolean");
  const metaCols = restCols.filter((c) => c.kind !== "tone" && c.kind !== "boolean");
  const visibleRows = table.getRowModel().rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full md:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={t("actions.search")}
            aria-label={t("actions.search")}
            className="pl-10"
          />
        </div>
        {sortable.length > 1 && rows.length > 1 ? (
          <label className="flex items-center gap-2 text-sm md:hidden">
            <span className="shrink-0 text-muted-foreground">{tUi("sortBy")}</span>
            <NativeSelect
              value={sortValue}
              onChange={(e) => {
                const [id, dir] = e.target.value.split(":");
                setSorting(id ? [{ id, desc: dir === "desc" }] : []);
              }}
            >
              <option value="">{tUi("sortDefault")}</option>
              {sortable.flatMap((c) => [
                <option key={`${c.key}:asc`} value={`${c.key}:asc`}>
                  {c.header} ↑
                </option>,
                <option key={`${c.key}:desc`} value={`${c.key}:desc`}>
                  {c.header} ↓
                </option>,
              ])}
            </NativeSelect>
          </label>
        ) : null}
      </div>

      {/* Phones: one card per row. */}
      <ul className="grid gap-2 md:hidden">
        {visibleRows.length === 0 ? (
          <li className="rounded-2xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {t("actions.noResults")}
          </li>
        ) : (
          visibleRows.map((row) => {
            const r = row.original;
            const body = (
              <>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 font-semibold break-words">
                    {titleCol ? renderCell(titleCol, r[titleCol.key]) : null}
                  </div>
                  {pillCols.map((c) =>
                    isEmptyCell(r[c.key], c.kind, locale) ? null : (
                      <span key={c.key} className="shrink-0">
                        {renderCell(c, r[c.key])}
                      </span>
                    ),
                  )}
                  {editHref ? (
                    <ChevronRight
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
                {metaCols.length ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {metaCols.map((c) =>
                      isEmptyCell(r[c.key], c.kind, locale) ? null : (
                        <div key={c.key} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{c.header}</dt>
                          <dd className="break-words">{renderCell(c, r[c.key])}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                ) : null}
                {flagCols.length ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {flagCols.map((c) => (
                      <li
                        key={c.key}
                        className={
                          r[c.key]
                            ? "inline-flex items-center gap-1 rounded-full bg-accent-green/10 px-2 py-0.5 font-medium text-accent-green"
                            : "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
                        }
                      >
                        {r[c.key] ? (
                          <Check className="size-3.5" aria-label="yes" />
                        ) : (
                          <Minus className="size-3.5" aria-label="no" />
                        )}
                        {c.header}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            );
            return (
              <li key={row.id}>
                {editHref ? (
                  <Link
                    href={`${editHref}/${r.id}`}
                    aria-label={`${editLabel ?? t("actions.edit")}: ${titleCol ? cellText(r[titleCol.key], titleCol.kind, locale) : r.id}`}
                    className="block rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted/50"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="rounded-2xl border bg-card p-4">{body}</div>
                )}
              </li>
            );
          })
        )}
      </ul>

      {/* `relative` keeps the absolutely positioned sr-only header inside the scroller. */}
      <div className="relative hidden overflow-x-auto rounded-2xl border bg-card md:block">
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
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={tableColumns.length} className="px-4 py-8 text-center text-muted-foreground">
                  {t("actions.noResults")}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
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
        <div className="flex items-center justify-between gap-2 text-sm md:justify-end">
          <span className="text-muted-foreground">
            {t("actions.page", { page: table.getState().pagination.pageIndex + 1, pages: pageCount })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              {t("actions.prev")}
            </Button>
            <Button
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {t("actions.next")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
