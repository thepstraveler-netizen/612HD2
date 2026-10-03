"use client";

import { createClient } from "@/lib/supabase/client";
import { wishlistKey, type WishlistSubject } from "./types";

/**
 * The visitor's wishlist, loaded once per page in the browser and shared by
 * every heart button, so catalog pages stay statically rendered. Writes go
 * straight to `wishlists` with the user's own session (RLS: own rows).
 */

export type WishlistState = {
  status: "idle" | "loading" | "ready";
  signedIn: boolean;
  keys: ReadonlySet<string>;
};

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const IDLE: WishlistState = { status: "idle", signedIn: false, keys: new Set() };
let state: WishlistState = IDLE;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: WishlistState) {
  state = next;
  for (const l of listeners) l();
}

export function loadWishlist(): Promise<void> {
  if (loading) return loading;
  if (!configured) {
    set({ status: "ready", signedIn: false, keys: new Set() });
    loading = Promise.resolve();
    return loading;
  }
  set({ ...state, status: "loading" });
  loading = (async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        set({ status: "ready", signedIn: false, keys: new Set() });
        return;
      }
      const { data: rows } = await supabase
        .from("wishlists")
        .select("subject_type, subject_id")
        .eq("user_id", data.user.id)
        .limit(500);
      set({
        status: "ready",
        signedIn: true,
        keys: new Set((rows ?? []).map((r) => wishlistKey(r.subject_type, r.subject_id))),
      });
    } catch {
      set({ status: "ready", signedIn: false, keys: new Set() });
    }
  })();
  return loading;
}

/** Loads again (e.g. the visitor signed in since the page first loaded). */
export function refreshWishlist(): Promise<void> {
  loading = null;
  return loadWishlist();
}

export function subscribeWishlist(listener: () => void): () => void {
  listeners.add(listener);
  if (state.status === "idle") void loadWishlist();
  return () => listeners.delete(listener);
}

export const getWishlistSnapshot = (): WishlistState => state;
export const getWishlistServerSnapshot = (): WishlistState => IDLE;

/**
 * Optimistically saves or removes an item. Resolves to the saved state, or
 * `null` when the write failed (the change is rolled back) or no one is signed in.
 */
export async function toggleWishlist(type: WishlistSubject, id: string): Promise<boolean | null> {
  await loadWishlist();
  if (!state.signedIn) return null;
  const key = wishlistKey(type, id);
  const wasSaved = state.keys.has(key);
  const apply = (saved: boolean) => {
    const keys = new Set(state.keys);
    if (saved) keys.add(key);
    else keys.delete(key);
    set({ ...state, keys });
  };
  apply(!wasSaved);
  const supabase = createClient();
  const { error } = wasSaved
    ? await supabase.from("wishlists").delete().eq("subject_type", type).eq("subject_id", id)
    : await supabase.from("wishlists").insert({ subject_type: type, subject_id: id });
  // 23505: already saved in another tab, which is the state we wanted.
  if (error && error.code !== "23505") {
    apply(wasSaved);
    return null;
  }
  return !wasSaved;
}
