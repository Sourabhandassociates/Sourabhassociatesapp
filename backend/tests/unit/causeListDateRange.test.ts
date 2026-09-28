import { describe, it, expect } from "vitest";
import { resolveDateRange } from "../../src/modules/hearings/causeList.service";

// A fixed Wednesday, so THIS_WEEK's Sunday-start window is unambiguous.
const NOW = new Date("2026-08-05T12:00:00.000Z"); // Wednesday

describe("resolveDateRange (Step 4 — Cause List)", () => {
  it("TODAY resolves to the start/end of the injected now", () => {
    const { start, end } = resolveDateRange({ rangePreset: "TODAY" }, NOW);
    expect(start.getDate()).toBe(5);
    expect(end.getDate()).toBe(5);
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
  });

  it("TOMORROW resolves to the day after now", () => {
    const { start, end } = resolveDateRange({ rangePreset: "TOMORROW" }, NOW);
    expect(start.getDate()).toBe(6);
    expect(end.getDate()).toBe(6);
  });

  it("NEXT_7_DAYS spans tomorrow through 7 days ahead, excluding today", () => {
    const { start, end } = resolveDateRange({ rangePreset: "NEXT_7_DAYS" }, NOW);
    expect(start.getDate()).toBe(6);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(12);
    expect(end.getHours()).toBe(23);
  });

  it("THIS_WEEK spans Sunday through Saturday of the current week", () => {
    const { start, end } = resolveDateRange({ rangePreset: "THIS_WEEK" }, NOW);
    // 2026-08-05 is a Wednesday; that week's Sunday is 2026-08-02, Saturday is 2026-08-08.
    expect(start.getDate()).toBe(2);
    expect(start.getDay()).toBe(0);
    expect(end.getDate()).toBe(8);
    expect(end.getDay()).toBe(6);
  });

  it("CUSTOM uses the supplied startDate/endDate", () => {
    const { start, end } = resolveDateRange(
      { rangePreset: "CUSTOM", startDate: "2026-01-01", endDate: "2026-01-31" },
      NOW
    );
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(31);
  });

  it("CUSTOM throws when startDate or endDate is missing", () => {
    expect(() => resolveDateRange({ rangePreset: "CUSTOM" }, NOW)).toThrow();
    expect(() => resolveDateRange({ rangePreset: "CUSTOM", startDate: "2026-01-01" }, NOW)).toThrow();
  });
});
