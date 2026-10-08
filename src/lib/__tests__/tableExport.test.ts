import { describe, expect, it } from "vitest";
import {
  buildCsv,
  buildTablePdfHtml,
  daysUntilDue,
  formatDaysUntilDue,
  formatIsoDate,
  formatTableCurrency,
  formatTableDate,
  resolveExportTimeZone,
} from "@/lib/helpers/admin/tableExport";

describe("resolveExportTimeZone", () => {
  it("keeps a valid IANA zone", () => {
    expect(resolveExportTimeZone("Asia/Dubai")).toBe("Asia/Dubai");
  });

  it("falls back to UTC for missing or invalid zones", () => {
    expect(resolveExportTimeZone(null)).toBe("UTC");
    expect(resolveExportTimeZone("Not/AZone")).toBe("UTC");
  });
});

describe("date formatting", () => {
  // Stored as UTC midnight, as the vendor invoice routes save YYYY-MM-DD.
  const due = new Date("2026-10-31T00:00:00.000Z");

  it("formats like DateDisplay in the given zone", () => {
    expect(formatTableDate(due, "Asia/Dubai")).toBe("Oct 31, 2026");
    expect(formatTableDate(due, "America/New_York")).toBe("Oct 30, 2026");
  });

  it("formats ISO dates in the given zone", () => {
    expect(formatIsoDate(due, "UTC")).toBe("2026-10-31");
    expect(formatIsoDate(due, "America/New_York")).toBe("2026-10-30");
  });
});

describe("formatTableCurrency", () => {
  it("matches CurrencyDisplay output", () => {
    expect(formatTableCurrency(1234.5)).toBe("$1,234.50");
    expect(formatTableCurrency("0")).toBe("$0.00");
  });
});

describe("daysUntilDue", () => {
  const due = new Date("2026-10-31T00:00:00.000Z");

  it("counts calendar days in the given zone", () => {
    const now = new Date("2026-10-08T10:00:00.000Z");
    expect(daysUntilDue(due, "UTC", now)).toBe(23);
    expect(daysUntilDue(due, "Asia/Dubai", now)).toBe(23);
  });

  it("uses the zone's calendar date for today", () => {
    // 22:00 UTC on Oct 30 is already Oct 31 in Dubai.
    const now = new Date("2026-10-30T22:00:00.000Z");
    expect(daysUntilDue(due, "UTC", now)).toBe(1);
    expect(daysUntilDue(due, "Asia/Dubai", now)).toBe(0);
  });

  it("goes negative when overdue", () => {
    const now = new Date("2026-11-03T12:00:00.000Z");
    expect(daysUntilDue(due, "UTC", now)).toBe(-3);
  });
});

describe("formatDaysUntilDue", () => {
  it("uses the dashboard table wording", () => {
    expect(formatDaysUntilDue(0)).toBe("Today");
    expect(formatDaysUntilDue(1)).toBe("1 day");
    expect(formatDaysUntilDue(5)).toBe("5 days");
    expect(formatDaysUntilDue(-1)).toBe("1 day overdue");
    expect(formatDaysUntilDue(-4)).toBe("4 days overdue");
  });
});

const BOM = String.fromCharCode(0xfeff);

describe("buildCsv", () => {
  it("quotes commas, quotes and newlines and adds a BOM", () => {
    const csv = buildCsv(
      ["A", "B"],
      [
        ["x,y", 'say "hi"'],
        ["line\nbreak", "ok"],
      ],
    );
    expect(csv).toBe(BOM + 'A,B\r\n"x,y","say ""hi"""\r\n"line\nbreak",ok\r\n');
  });

  it("neutralises formula-like cells", () => {
    const csv = buildCsv(["A"], [["=SUM(A1)"], ["-A1"], ["@x"], ["+1"]]);
    expect(csv).toBe(BOM + "A\r\n'=SUM(A1)\r\n'-A1\r\n'@x\r\n'+1\r\n");
  });

  it("leaves the table's lone '-' placeholder alone", () => {
    expect(buildCsv(["A"], [["-"]])).toBe(BOM + "A\r\n-\r\n");
  });

  it("leaves plain numbers numeric", () => {
    expect(buildCsv(["A"], [["-12.50"], ["1234.56"]])).toBe(
      BOM + "A\r\n-12.50\r\n1234.56\r\n",
    );
  });
});

describe("buildTablePdfHtml", () => {
  it("escapes cell values and shows an empty-state row", () => {
    const html = buildTablePdfHtml({
      title: "T",
      columns: [{ header: "A" }, { header: "B", align: "right" }],
      rows: [["<b>x</b>", "1"]],
      generatedAt: new Date("2026-10-08T00:00:00Z"),
      tz: "UTC",
    });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain('<td style="text-align:right">1</td>');
    expect(html).toContain("1 record");

    const empty = buildTablePdfHtml({
      title: "T",
      columns: [{ header: "A" }],
      rows: [],
      generatedAt: new Date(),
      tz: "UTC",
    });
    expect(empty).toContain("No records found");
  });
});
