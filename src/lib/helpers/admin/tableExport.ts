import {
  CURRENCY_FORMAT_OPTIONS,
  CURRENCY_LOCALE,
} from "@/lib/constants/accounting";

/**
 * Shared helpers for the accounting list exports (CSV + PDF). Values are
 * formatted the same way the dashboard tables render them, in the viewer's
 * timezone (passed by the client as `tz`), so an export matches the screen.
 */

export function resolveExportTimeZone(param: string | null): string {
  if (!param) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: param });
    return param;
  } catch {
    return "UTC";
  }
}

const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

/** Same output as <DateDisplay format="date" />, e.g. "Oct 8, 2026". */
export function formatTableDate(d: Date | string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: tz,
  }).format(toDate(d));
}

/** Calendar date in `tz` as YYYY-MM-DD. */
export function formatIsoDate(d: Date | string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(toDate(d));
}

/** Same output as <CurrencyDisplay />, e.g. "$1,234.56". */
export function formatTableCurrency(value: number | string): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE, CURRENCY_FORMAT_OPTIONS).format(
    Number(value),
  );
}

/**
 * Whole calendar days from today to the due date, both taken in `tz` -
 * what the dashboards' calculateDaysUntilDue gives in the browser.
 */
export function daysUntilDue(
  due: Date | string,
  tz: string,
  now: Date = new Date(),
): number {
  const dayNumber = (d: Date) => {
    const [y, m, day] = formatIsoDate(d, tz).split("-").map(Number);
    return Date.UTC(y, m - 1, day) / (1000 * 60 * 60 * 24);
  };
  return dayNumber(toDate(due)) - dayNumber(now);
}

/**
 * A list filter's YYYY-MM-DD date param (from an <input type="date">), or
 * null when missing or not a real calendar date.
 */
export function parseDateParam(param: string | null): string | null {
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return null;
  const d = new Date(`${param}T00:00:00.000Z`);
  return !isNaN(d.getTime()) && d.toISOString().startsWith(param)
    ? param
    : null;
}

/** UTC midnight of a YYYY-MM-DD date - how @db.Date columns are stored. */
export function utcDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** YYYY-MM-DD shifted by `days` calendar days. */
export function addDays(ymd: string, days: number): string {
  const d = utcDayStart(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Offset of `tz` from UTC at instant `d`, in ms (e.g. +4h for Asia/Dubai). */
function timeZoneOffsetMs(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/**
 * The instant 00:00 starts on a YYYY-MM-DD calendar day in `tz`, so a
 * timestamp column can be filtered by the day <DateDisplay> shows for it.
 */
export function zonedDayStart(ymd: string, tz: string): Date {
  const guess = utcDayStart(ymd).getTime();
  const first = guess - timeZoneOffsetMs(new Date(guess), tz);
  // Re-read the offset at the result in case a DST change sits in between.
  return new Date(guess - timeZoneOffsetMs(new Date(first), tz));
}

/** PDF subtitle text for an issued-date range filter. */
export function formatIssuedRange(
  startDate: string | null,
  endDate: string | null,
): string {
  const label = (ymd: string) => formatTableDate(utcDayStart(ymd), "UTC");
  if (startDate && endDate) return `${label(startDate)} – ${label(endDate)}`;
  if (startDate) return `from ${label(startDate)}`;
  if (endDate) return `up to ${label(endDate)}`;
  return "All dates";
}

/** The "Days Until Due" cell text used by the dashboard tables. */
export function formatDaysUntilDue(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  if (days < 0) {
    const overdue = Math.abs(days);
    return `${overdue} ${overdue === 1 ? "day" : "days"} overdue`;
  }
  return `${days} days`;
}

const UTF8_BOM = String.fromCharCode(0xfeff);

function escapeCsvCell(value: string): string {
  // Stop spreadsheet apps from evaluating a cell as a formula; plain
  // numbers (e.g. a negative amount) and a lone "-" placeholder stay as-is.
  const isNumber = /^-?\d+(\.\d+)?$/.test(value);
  const safe = !isNumber && /^[=+\-@][\s\S]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel picks up the encoding. */
export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCsvCell).join(","),
  );
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface TablePdfColumn {
  header: string;
  align?: "left" | "right";
  /** Keep cell values (dates, amounts) on one line. */
  nowrap?: boolean;
}

interface BuildTablePdfHtmlOptions {
  title: string;
  subtitle?: string;
  columns: TablePdfColumn[];
  rows: string[][];
  generatedAt: Date;
  tz: string;
}

/**
 * Renders a plain table as a standalone HTML document for
 * generatePDFFromHTML (Puppeteer).
 */
export function buildTablePdfHtml({
  title,
  subtitle,
  columns,
  rows,
  generatedAt,
  tz,
}: BuildTablePdfHtmlOptions): string {
  const style = (i: number, isCell: boolean) => {
    const rules = [
      columns[i]?.align === "right" ? "text-align:right" : "",
      isCell && columns[i]?.nowrap ? "white-space:nowrap" : "",
    ].filter(Boolean);
    return rules.length ? ` style="${rules.join(";")}"` : "";
  };

  const headerHtml = columns
    .map((c, i) => `<th${style(i, false)}>${escapeHtml(c.header)}</th>`)
    .join("");

  const rowsHtml = rows
    .map(
      (row) =>
        `<tr>${row.map((cell, i) => `<td${style(i, true)}>${escapeHtml(cell)}</td>`).join("")}</tr>`,
    )
    .join("");

  const generated = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
    timeZoneName: "short",
  }).format(generatedAt);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px 0; }
  .subtitle { color: #555; font-size: 12px; margin: 0 0 20px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border-bottom: 1px solid #e0e0e0; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; letter-spacing: 0.02em; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .footer { margin-top: 18px; font-size: 10px; color: #888; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}

  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="${columns.length}" style="text-align:center;color:#888;">No records found</td></tr>`}
    </tbody>
  </table>

  <p class="footer">Generated ${escapeHtml(generated)} &middot; ${rows.length.toLocaleString("en-US")} record${rows.length === 1 ? "" : "s"}</p>
</body>
</html>`;
}
