import { describe, expect, it } from "vitest";
import { isStaleBuildError, shouldHardNavigate } from "@/lib/pwa/build";

const click = {
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};
const anchor = (over: Partial<{ href: string; origin: string; target: string; download: boolean }> = {}) => ({
  href: "https://ps.example/hotels",
  origin: "https://ps.example",
  target: "",
  ...over,
  hasAttribute: (name: string) => name === "download" && Boolean(over.download),
});

describe("stale build guard", () => {
  it("recognises missing chunks and server actions from an older deployment", () => {
    const chunk = new Error(
      "Loading chunk 4471 failed.\n(error: https://ps.example/_next/static/chunks/4471.js)",
    );
    chunk.name = "ChunkLoadError";
    expect(isStaleBuildError(chunk)).toBe(true);
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
    expect(
      isStaleBuildError(
        new Error(
          'Server Action "7f3a" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action',
        ),
      ),
    ).toBe(true);
    expect(isStaleBuildError(new Error("price_changed"))).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });

  it("turns only plain same-tab, same-site link clicks into full page loads", () => {
    const origin = "https://ps.example";
    expect(shouldHardNavigate(click, anchor(), origin)).toBe(true);
    expect(shouldHardNavigate(click, anchor({ target: "_self" }), origin)).toBe(true);
    expect(shouldHardNavigate({ ...click, ctrlKey: true }, anchor(), origin)).toBe(false);
    expect(shouldHardNavigate({ ...click, button: 1 }, anchor(), origin)).toBe(false);
    expect(shouldHardNavigate({ ...click, defaultPrevented: true }, anchor(), origin)).toBe(false);
    expect(shouldHardNavigate(click, anchor({ target: "_blank" }), origin)).toBe(false);
    expect(shouldHardNavigate(click, anchor({ download: true }), origin)).toBe(false);
    expect(shouldHardNavigate(click, anchor({ origin: "https://wa.me" }), origin)).toBe(false);
  });
});
