const TYPE_LABELS: Record<string, string> = {
  PAYMENT: "Payment",
  ELECTRICITY_CHARGES: "Hosting & electricity charges",
  ADJUSTMENT: "Adjustment",
  HARDWARE_SALES: "Hardware sales payment",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PdfSummaryRow {
  label: string;
  value: string;
}

export interface PdfTransactionRow {
  createdAt: Date | string;
  type: string;
  amount: number;
  narration: string | null;
  customerName: string | null;
  customerEmail: string | null;
  invoiceNumber: string | null;
}

interface BuildPdfHtmlOptions {
  title: string;
  subtitle?: string;
  summaryRows: PdfSummaryRow[];
  transactions: PdfTransactionRow[];
  totalMatched: number;
  truncated: boolean;
  rowLimit: number;
  generatedAt: Date;
}

/**
 * Renders the itemized CostPayment transactions (plus a summary block) as a
 * standalone HTML document, for use with generatePDFFromHTML (Puppeteer).
 */
export function buildCostPaymentTransactionsPdfHtml({
  title,
  subtitle,
  summaryRows,
  transactions,
  totalMatched,
  truncated,
  rowLimit,
  generatedAt,
}: BuildPdfHtmlOptions): string {
  const summaryHtml = summaryRows
    .map(
      (row) => `
        <div class="summary-item">
          <div class="summary-label">${escapeHtml(row.label)}</div>
          <div class="summary-value">${escapeHtml(row.value)}</div>
        </div>`,
    )
    .join("");

  const rowsHtml = transactions
    .map(
      (t) => `
        <tr>
          <td>${escapeHtml(formatDate(t.createdAt))}</td>
          <td>${escapeHtml(t.customerName || t.customerEmail || "—")}</td>
          <td>${escapeHtml(TYPE_LABELS[t.type] || t.type)}</td>
          <td class="amount ${t.amount < 0 ? "negative" : "positive"}">${escapeHtml(formatCurrency(t.amount))}</td>
          <td>${escapeHtml(t.invoiceNumber || "—")}</td>
          <td>${escapeHtml(t.narration || "—")}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px 0; }
  .subtitle { color: #555; font-size: 12px; margin: 0 0 20px 0; }
  .summary { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
  .summary-item { border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; min-width: 150px; }
  .summary-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.03em; }
  .summary-value { font-size: 15px; font-weight: bold; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border-bottom: 1px solid #e0e0e0; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; letter-spacing: 0.02em; }
  td.amount { text-align: right; font-weight: 600; }
  td.amount.negative { color: #c62828; }
  td.amount.positive { color: #2e7d32; }
  .note { margin-top: 14px; font-size: 11px; color: #b26a00; }
  .footer { margin-top: 18px; font-size: 10px; color: #888; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}

  <div class="summary">${summaryHtml}</div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Customer</th>
        <th>Type</th>
        <th style="text-align:right">Amount</th>
        <th>Invoice #</th>
        <th>Narration</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:#888;">No transactions found</td></tr>`}
    </tbody>
  </table>

  ${
    truncated
      ? `<p class="note">Showing the first ${rowLimit.toLocaleString()} of ${totalMatched.toLocaleString()} matching transactions. Narrow the filters to export the full set.</p>`
      : ""
  }

  <p class="footer">Generated ${escapeHtml(formatDate(generatedAt))} &middot; ${totalMatched.toLocaleString()} matching transaction${totalMatched === 1 ? "" : "s"}</p>
</body>
</html>`;
}
