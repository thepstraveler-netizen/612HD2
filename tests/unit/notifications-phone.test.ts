import { describe, expect, it } from "vitest";
import { normalizeIndianPhone, providerDigits } from "@/lib/notifications/phone";

describe("normalizeIndianPhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["+91(98765)43210", "+919876543210"],
    ["0091 98765 43210", "+919876543210"],
    ["  6000000000 ", "+916000000000"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["12345"],
    ["5876543210"], // mobiles start 6-9
    ["0562 2501234"], // landline
    ["+1 415 555 0100"], // not India
    ["+44 7911 123456"],
    ["98765432101"], // 11 digits not starting with 0
    ["98765abc10"],
    ["9876543210; drop table"],
  ])("rejects %s", (input) => {
    expect(normalizeIndianPhone(input)).toBeNull();
  });

  it("strips the plus for providers", () => {
    expect(providerDigits("+919876543210")).toBe("919876543210");
  });
});
