import { describe, expect, it } from "vitest";
import { hotelsToCsv, type HotelExportRow } from "@/lib/hotels/csv";
import { parseCsv, parseHotelImport } from "@/lib/hotels/csv-import";

const HEADER =
  "hotel_slug,hotel_name,status,city,property_type,stars,room,units,rate_plan,meal_plan,base_price_inr,extra_adult_inr,extra_child_inr,refundable";

const exported: HotelExportRow = {
  hotelSlug: "radha-niwas",
  hotelName: 'Radha "Niwas", Vrindavan',
  status: "published",
  citySlug: "vrindavan",
  propertyType: "guest_house",
  stars: 3,
  roomName: "=Deluxe",
  units: 4,
  planName: "Room only",
  mealPlan: "room_only",
  basePricePaise: 249_950,
  extraAdultPaise: 50_000,
  extraChildPaise: 0,
  refundable: false,
};

describe("CSV parsing", () => {
  it("handles quotes, doubled quotes, embedded commas and newlines, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ]);
  });
});

describe("hotel import", () => {
  it("reads back exactly what the export writes, formula guard included", () => {
    const { rows, issues } = parseHotelImport(hotelsToCsv([exported]));
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        hotel_slug: "radha-niwas",
        hotel_name: 'Radha "Niwas", Vrindavan',
        status: "published",
        city: "vrindavan",
        property_type: "guest_house",
        stars: 3,
        room: "=Deluxe",
        units: 4,
        rate_plan: "Room only",
        meal_plan: "room_only",
        base_price_paise: 249_950,
        extra_adult_paise: 50_000,
        extra_child_paise: 0,
        refundable: false,
      },
    ]);
  });

  it("fills defaults and accepts hotel-only rows in any column order", () => {
    const { rows, issues } = parseHotelImport(
      "city,hotel_name,hotel_slug\nvrindavan,Shanti Ashram,shanti-ashram\n",
    );
    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({
      status: "draft",
      property_type: "hotel",
      stars: 0,
      room: null,
      rate_plan: null,
      base_price_paise: null,
      refundable: true,
    });
  });

  it("reports every problem with its line and column, and imports nothing", () => {
    const csv = [
      HEADER,
      "good-inn,Good Inn,draft,vrindavan,hotel,2,Standard,3,Room only,room_only,1500,0,0,yes",
      "Bad Slug,Bad,draft,vrindavan,hotel,2,,,,,,,,",
      "good-inn,Good Inn,published,vrindavan,hotel,2,Standard,3,Breakfast,breakfast,1700,0,0,yes",
      "good-inn,Good Inn,draft,vrindavan,hotel,2,Standard,5,Half board,half_board,1900,0,0,yes",
      "good-inn,Good Inn,draft,vrindavan,hotel,2,standard,3,ROOM ONLY,room_only,1500,0,0,yes",
      "next-inn,Next Inn,draft,vrindavan,castle,9,Suite,,Plan,room_only,12.345,0,0,maybe",
    ].join("\n");
    const { issues } = parseHotelImport(csv);
    expect(issues).toEqual([
      { line: 3, column: "hotel_slug", message: "invalidSlug" },
      { line: 4, column: "status", message: "hotelDetailsDiffer" },
      { line: 5, column: "units", message: "roomDetailsDiffer" },
      { line: 6, column: "rate_plan", message: "duplicatePlan" },
      { line: 7, column: "property_type", message: expect.any(String) },
      { line: 7, column: "stars", message: expect.any(String) },
      { line: 7, column: "base_price_inr", message: "invalidAmount" },
      { line: 7, column: "refundable", message: "invalidYesNo" },
    ]);
  });

  it("checks the header and the file size", () => {
    expect(parseHotelImport("hotel_slug,price\nx,1\n").issues).toEqual([
      { line: 1, column: "price", message: "unknownColumn" },
      { line: 1, column: "hotel_name", message: "missingColumn" },
      { line: 1, column: "city", message: "missingColumn" },
    ]);
    expect(parseHotelImport(HEADER).issues).toEqual([{ line: 0, message: "emptyFile" }]);
    expect(parseHotelImport("x".repeat(800_001)).issues).toEqual([{ line: 0, message: "fileTooLarge" }]);
  });

  it("requires a plan, units and price once a room is named", () => {
    const { issues } = parseHotelImport(`${HEADER}\na-inn,A Inn,draft,vrindavan,hotel,1,Room,,,,,,,\n`);
    expect(issues.map((i) => i.column).sort()).toEqual(["base_price_inr", "rate_plan", "units"]);
  });
});
