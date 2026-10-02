"use client";

import { useCallback, useSyncExternalStore } from "react";
import { cartReducer, EMPTY_CART, parseStoredCart, type CartAction, type CartState } from "@/lib/delivery/ui";

/**
 * The shop cart: one store's lines, kept in localStorage so it survives a
 * reload or a sign-in redirect, and shared by the menu page, the sticky cart
 * bar and checkout through useSyncExternalStore (no extra dependency).
 * Other tabs pick changes up through the `storage` event.
 */

const STORAGE_KEY = "pst.cart.v1";

let state: CartState = EMPTY_CART;
let loaded = false;
const listeners = new Set<() => void>();

function read(): CartState {
  try {
    return parseStoredCart(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY_CART;
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = read();
}

function emit() {
  for (const l of listeners) l();
}

export function dispatchCart(action: CartAction) {
  ensureLoaded();
  state = cartReducer(state, action);
  try {
    if (state.lines.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or storage full: the cart still works for this page view.
  }
  emit();
}

function onStorage(e: StorageEvent) {
  if (e.key !== STORAGE_KEY) return;
  state = parseStoredCart(e.newValue);
  emit();
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  ensureLoaded();
  return state;
}

const getServerSnapshot = () => EMPTY_CART;

/** The cart and its dispatcher. Renders empty on the server and on the first client pass. */
export function useCart(): [CartState, (action: CartAction) => void] {
  const cart = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const dispatch = useCallback((action: CartAction) => dispatchCart(action), []);
  return [cart, dispatch];
}

/** False during server render and hydration, so cart-dependent UI doesn't flash wrong. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const noopSubscribe = () => () => undefined;
