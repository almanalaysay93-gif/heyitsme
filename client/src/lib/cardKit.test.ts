import { describe, expect, it } from "vitest";
import { followUpDay, sortByFollowUp } from "./cardKit";

type Row = { id: number; followUpOn?: string | Date | null; followedUp?: boolean };
const ids = (rows: Row[]) => sortByFollowUp(rows).map((row) => row.id);

describe("followUpDay", () => {
  it("reads the stored midnight UTC back as the picked day", () => {
    expect(followUpDay(new Date("2026-10-02T00:00:00Z"))).toBe("2026-10-02");
    expect(followUpDay("2026-10-02T00:00:00.000Z")).toBe("2026-10-02");
  });

  it("is empty for no date or a bad one", () => {
    expect(followUpDay(null)).toBe("");
    expect(followUpDay(undefined)).toBe("");
    expect(followUpDay("not a date")).toBe("");
  });
});

describe("sortByFollowUp", () => {
  it("puts dated contacts first, soonest first, and keeps the rest in list order", () => {
    // The list arrives newest first.
    const rows: Row[] = [
      { id: 5 },
      { id: 4, followUpOn: new Date("2026-11-01T00:00:00Z") },
      { id: 3 },
      { id: 2, followUpOn: new Date("2026-10-01T00:00:00Z") },
      { id: 1 },
    ];
    expect(ids(rows)).toEqual([2, 4, 5, 3, 1]);
  });

  it("keeps list order between contacts due the same day", () => {
    const day = new Date("2026-10-01T00:00:00Z");
    expect(ids([{ id: 9, followUpOn: day }, { id: 8, followUpOn: day }])).toEqual([9, 8]);
  });

  it("drops a followed-up contact back into place even with a date", () => {
    const rows: Row[] = [
      { id: 3 },
      { id: 2, followUpOn: new Date("2026-10-01T00:00:00Z"), followedUp: true },
      { id: 1, followUpOn: new Date("2026-12-01T00:00:00Z") },
    ];
    expect(ids(rows)).toEqual([1, 3, 2]);
  });

  it("does not change the input array", () => {
    const rows: Row[] = [{ id: 2 }, { id: 1, followUpOn: new Date("2026-10-01T00:00:00Z") }];
    sortByFollowUp(rows);
    expect(rows.map((row) => row.id)).toEqual([2, 1]);
  });
});
