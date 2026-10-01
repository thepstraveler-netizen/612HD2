import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import hi from "@/messages/hi.json";
import { ADMIN_MODULES } from "@/lib/permissions/constants";
import { SERVICES } from "@/lib/services";

type Messages = { [key: string]: string | Messages };

function flatten(obj: Messages, prefix = ""): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") acc[path] = value;
    else Object.assign(acc, flatten(value, path));
    return acc;
  }, {});
}

const enKeys = flatten(en as Messages);
const hiKeys = flatten(hi as Messages);

describe("translations", () => {
  it("has a Hindi string for every English key and no extras", () => {
    expect(Object.keys(hiKeys).sort()).toEqual(Object.keys(enKeys).sort());
  });

  it("has no empty strings", () => {
    for (const [key, value] of [...Object.entries(enKeys), ...Object.entries(hiKeys)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("keeps ICU placeholders identical across locales", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(enKeys)) {
      expect(placeholders(hiKeys[key]), key).toEqual(placeholders(enKeys[key]));
    }
  });

  it("names every service and admin module", () => {
    for (const s of SERVICES) expect(enKeys[`services.${s.slug}.name`], s.slug).toBeDefined();
    for (const m of ADMIN_MODULES) expect(enKeys[`admin.modules.${m}`], m).toBeDefined();
  });
});
