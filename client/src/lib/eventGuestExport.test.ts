import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { eventGuestWorkbook, guestExportTable } from "./eventGuestExport";

describe("event guest export", () => {
  const fields = [{ id: 1, label: "Full name" }, { id: 2, label: "Guest names" }];
  const rows = [{
    status: "attending" as const,
    submittedAt: new Date("2026-10-04T10:00:00.000Z"),
    checkedInAt: null,
    answers: { "1": "Ann", "2": '=HYPERLINK("https://bad.example")' },
  }];

  it("keeps every answer and status in the guest table", () => {
    expect(guestExportTable(fields, rows)).toEqual({
      headings: ["Response", "Sent", "Checked in", "Full name", "Guest names"],
      values: [["Attending", "2026-10-04T10:00:00.000Z", "", "Ann", '=HYPERLINK("https://bad.example")']],
    });
  });

  it("writes a valid Excel package with text answers, not formulas", async () => {
    const bytes = await eventGuestWorkbook(fields, rows);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml"].sort());
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(strFromU8(files["xl/workbook.xml"])).toContain('<sheet name="Guests"');
    expect(sheet).toContain('r="D2" t="inlineStr"><is><t xml:space="preserve">Ann</t>');
    expect(sheet).toContain('r="E2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;https://bad.example&quot;)</t>');
    expect(sheet).not.toContain("<f>");
  });
});
