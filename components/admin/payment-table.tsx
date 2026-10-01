import type { ReactNode } from "react";

/**
 * Read-only, server-rendered table for operational lists (payments,
 * refunds, webhook events, notification logs, booking lines). Cells are
 * already formatted nodes, so links and badges need no client bundle; it
 * scrolls sideways on small screens.
 */
export function AdminTable({
  headers,
  rows,
  empty,
}: {
  headers: ReactNode[];
  rows: { key: string; cells: ReactNode[] }[];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
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
  );
}
