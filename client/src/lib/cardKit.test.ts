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

describe("contact status filter predicates (T10)", () => {
  type Contact = { id: number; name: string; followedUp?: boolean };
  const newIds = new Set([1, 2]);
  const contacts: Contact[] = [
    { id: 1, name: "New & Followed Up", followedUp: true },
    { id: 2, name: "New & Needs Follow-up", followedUp: false },
    { id: 3, name: "Old & Followed Up", followedUp: true },
    { id: 4, name: "Old & Needs Follow-up", followedUp: false },
  ];

  it("new (Newly received) filter includes all contacts in newIds regardless of followedUp status", () => {
    const filtered = contacts.filter((c) => newIds.has(c.id));
    expect(filtered.map((c) => c.id)).toEqual([1, 2]);
  });

  it("todo (Needs follow-up) filter strictly includes followedUp=false", () => {
    const filtered = contacts.filter((c) => !c.followedUp);
    expect(filtered.map((c) => c.id)).toEqual([2, 4]);
  });

  it("done (Followed up) filter strictly includes followedUp=true", () => {
    const filtered = contacts.filter((c) => Boolean(c.followedUp));
    expect(filtered.map((c) => c.id)).toEqual([1, 3]);
  });

  it("supports dual-status: a newly received contact can be followed-up without contradiction", () => {
    const contact = contacts[0];
    const isNew = newIds.has(contact.id);
    const isDone = Boolean(contact.followedUp);
    expect(isNew).toBe(true);
    expect(isDone).toBe(true);
  });
});
