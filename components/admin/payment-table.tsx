import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function isBlank(cell: ReactNode): boolean {
  return cell === null || cell === undefined || cell === false || cell === "" || cell === "–" || cell === "—";
}

/**
 * Read-only, server-rendered table for operational lists (payments,
 * refunds, webhook events, notification logs, booking lines). Cells are
 * already formatted nodes, so links and badges need no client bundle.
 *
 * Below `md` each row becomes a card: the `titleColumn` cell on top (with
 * the `statusColumn` pill beside it), the others as label/value pairs (`wide` columns, such as actions, span the
 * card). `mobile="scroll"` keeps the sideways-scrolling table instead, for
 * dense numeric grids that read better as a table.
 */
export function AdminTable({
  headers,
  rows,
  empty,
  titleColumn = 0,
  statusColumn,
  wide = [],
  mobile = "cards",
}: {
  headers: ReactNode[];
  rows: { key: string; cells: ReactNode[] }[];
  empty: string;
  /** Which cell titles the phone card. */
  titleColumn?: number;
  /** A status cell shown beside the title on phones. */
  statusColumn?: number;
  /** Cells that take the full card width on phones (actions, long text). */
  wide?: number[];
  mobile?: "cards" | "scroll";
}) {
  const cards = mobile === "cards";
  return (
    <>
      {cards ? (
        <ul className="grid gap-2 md:hidden">
          {rows.length === 0 ? (
            <li className="rounded-2xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              {empty}
            </li>
          ) : (
            rows.map((row) => (
              <li key={row.key} className="rounded-2xl border bg-card p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-semibold break-words">{row.cells[titleColumn]}</div>
                  {statusColumn !== undefined && !isBlank(row.cells[statusColumn]) ? (
                    <div className="shrink-0">{row.cells[statusColumn]}</div>
                  ) : null}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  {row.cells.map((cell, i) =>
                    i === titleColumn || i === statusColumn || isBlank(cell) ? null : (
                      <div key={i} className={cn("min-w-0", wide.includes(i) && "col-span-2")}>
                        <dt className="text-xs text-muted-foreground [&_.text-right]:text-left">
                          {headers[i]}
                        </dt>
                        <dd className="break-words [&_.text-right]:text-left [&_.whitespace-nowrap]:whitespace-normal">
                          {cell}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {/* `relative` keeps absolutely positioned sr-only headers inside the scroller. */}
      <div className={cn("relative overflow-x-auto rounded-2xl border bg-card", cards && "hidden md:block")}>
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
            <tr>
              {headers.map((h, i) => (
                <th key={i} scope="col" className="px-4 py-3 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-4 py-8 text-center text-muted-foreground">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="border-b align-top last:border-0">
                  {row.cells.map((cell, i) => (
                    <td key={i} className="px-4 py-2.5">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
