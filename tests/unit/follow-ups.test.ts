import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { documentPaths, groupPaths, USER_FILE_FOLDERS } = await import("@/lib/privacy/files");
const { tripErrorKey } = await import("@/lib/cabs/admin-rows");
const { rideErrorKey } = await import("@/lib/rides/admin-rows");

describe("account deletion files", () => {
  it("knows each user's folders", () => {
    expect(USER_FILE_FOLDERS.map((f) => `${f.bucket}:${f.folder("u1")}`)).toEqual([
      "prescriptions:u1",
      "documents:partners/u1",
      "media:reviews/u1",
    ]);
  });

  it("groups listed and recorded paths by bucket without duplicates", () => {
    const grouped = groupPaths([
      { bucket: "prescriptions", path: "u1/a.pdf" },
      { bucket: "prescriptions", path: "/u1/a.pdf" },
      { bucket: "media", path: "reviews/u1/x.jpg" },
      { bucket: "documents", path: "" },
      { bucket: "documents", path: null },
    ]);
    expect(Object.fromEntries(grouped)).toEqual({
      prescriptions: ["u1/a.pdf"],
      media: ["reviews/u1/x.jpg"],
    });
  });

  it("reads paths out of partner application documents", () => {
    expect(documentPaths([{ path: "partners/u1/a.pdf", kind: "id" }, { kind: "x" }, "junk", null])).toEqual([
      "partners/u1/a.pdf",
    ]);
    expect(documentPaths({ path: "nope" })).toEqual([]);
  });
});

describe("dispatch overlap errors", () => {
  it("map to their own messages for cabs and rides", () => {
    expect(tripErrorKey("driver_busy:PSTCAB0042")).toBe("driverBusy");
    expect(tripErrorKey("vehicle_busy:PSTCAB0042")).toBe("vehicleBusy");
    expect(rideErrorKey("driver_busy:PSTRID0007")).toBe("driverBusy");
    expect(rideErrorKey("vehicle_busy:PSTRID0007")).toBe("vehicleBusy");
  });
});
