"use client";

import { Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { savedTripPaths } from "@/lib/pwa/client";

/**
 * Lists the trip pages the service worker saved for offline use. Plain
 * links: the service worker answers them from its cache.
 */
export function SavedTrips({ title, lead, itemLabel }: { title: string; lead: string; itemLabel: string }) {
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void savedTripPaths().then((p) => {
      if (live) setPaths(p);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!paths.length) return null;
  return (
    <section aria-labelledby="saved-trips" className="space-y-3 rounded-2xl border bg-card p-4 text-start">
      <div>
        <h2 id="saved-trips" className="font-bold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </div>
      <ul className="space-y-2">
        {paths.map((path) => {
          const code = decodeURIComponent(path.split("/").pop() ?? "");
          return (
            <li key={path}>
              <a
                href={path}
                className="flex min-h-11 items-center gap-2 rounded-xl border px-3 font-medium text-primary hover:bg-secondary"
              >
                <Ticket className="size-4" aria-hidden="true" /> {itemLabel.replace("{code}", code)}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
