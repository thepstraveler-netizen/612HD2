import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema, updatePasswordSchema } from "@/schemas/auth";

describe("auth schemas", () => {
  it("normalises email", () => {
    expect(signInSchema.parse({ email: " Radha@Example.COM ", password: "x" }).email).toBe(
      "radha@example.com",
    );
  });

  it("returns i18n keys as messages", () => {
    const result = signUpSchema.safeParse({ fullName: "A", email: "nope", password: "short" });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message).sort();
    expect(messages).toEqual(["invalidEmail", "nameTooShort", "passwordTooShort"]);
  });

  it("requires matching passwords", () => {
    const result = updatePasswordSchema.safeParse({ password: "longenough", confirm: "different" });
    expect(result.error?.issues[0]).toMatchObject({ message: "passwordsDontMatch", path: ["confirm"] });
  });
});
