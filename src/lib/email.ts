import nodemailer from "nodemailer";
import { readFileSync } from "fs";
import { join } from "path";
import puppeteerCore from "puppeteer-core";
import puppeteer from "puppeteer";
import chromium from "@sparticuz/chromium-min";

// Utility function to format dates
const formatDate = (date: Date): string => {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// Utility function to format currency amounts with thousands separators
const formatCurrency = (amount: number): string => {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Render HTML template with invoice data
 * Supports {{variable}} replacement and {{#if variable}}...{{else}}...{{/if}} conditionals
 */
export const renderInvoiceTemplate = (
  template: string,
  data: Record<string, string | number | boolean | null | undefined>,
): string => {
  let html = template;

  // FIRST: Process conditionals BEFORE variable replacement
  // This ensures {{#if hardwareModel}}{{hardwareModel}}{{else}}default{{/if}} works correctly
  const conditionalRegex = /{{#if\s+(\w+)\s*}}([\s\S]*?){{\/if}}/g;
  html = html.replace(conditionalRegex, (match, variable, content) => {
    const value = data[variable];
    // Properly handle boolean false: false, null, undefined, and "" should not show content
    const shouldShow =
      value !== null && value !== undefined && value !== "" && value !== false;

    console.log(`[TEMPLATE] Conditional {{#if ${variable}}}:`, {
      value,
      type: typeof value,
      shouldShow,
    });

    // Check if there's an {{else}} clause
    const elseRegex = /^([\s\S]*?){{else}}([\s\S]*)$/;
    const elseMatch = content.match(elseRegex);

    if (elseMatch) {
      // Has {{else}} clause
      const ifContent = elseMatch[1];
      const elseContent = elseMatch[2];
      return shouldShow ? ifContent : elseContent;
    } else {
      // No {{else}} clause
      return shouldShow ? content : "";
    }
  });

  // SECOND: Process variable replacements AFTER conditionals are resolved
  Object.keys(data).forEach((key) => {
    const regex = new RegExp(`{{${key}}}`, "g");
    const value = data[key] ?? "";
    html = html.replace(regex, String(value));
  });

  return html;
};

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// CC email for all invoice communications
const CC_INVOICE_EMAIL =
  process.env.CC_INVOICES_EMAIL || "invoices@bitfactory.ae";

// Reply-To email for all invoice communications
const REPLY_TO_EMAILS =
  `${process.env.CC_INVOICES_EMAIL}, ${process.env.CC_SUPPORT_EMAIL}` ||
  "invoices@bitfactory.ae";

export const sendWelcomeEmail = async (email: string, tempPassword: string) => {
  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: email,
    subject: "Welcome to BitFactory - Your Account Details",
    html: `
      <h1>Welcome to BitFactory!</h1>
      <p>Your account has been created successfully. Here are your login credentials:</p>
      <p><strong>URL:</strong><a href="my.bitfactory.ae" target="_blank"> my.bitfactory.ae</a></p>
      <p><strong>Username:</strong> ${email}</p>
      <p><strong>Temporary Password:</strong> ${tempPassword}</p>
      <p>For security reasons, please change your password immediately after logging in.</p>
      <p>If you have any questions, please don't hesitate to contact our support team.</p>
      <br>
      <p>Best regards,</p>
      <p>The BitFactory Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return { success: false, error };
  }
};

export const sendPasswordResetEmail = async (
  email: string,
  tempPassword: string,
) => {
  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: email,
    subject: "Password Reset Request - BitFactory",
    html: `
      <h1>Password Reset</h1>
      <p>Your password has been reset successfully. Here are your updated login credentials:</p>
      <p><strong>URL:</strong><a href="https://my.bitfactory.ae" target="_blank"> my.bitfactory.ae</a></p>
      <p><strong>Username:</strong> ${email}</p>
      <p><strong>Temporary Password:</strong> ${tempPassword}</p>
      <p>For security reasons, please change your password immediately after logging in.</p>
      <p>If you did not request this password reset, please contact our support team immediately.</p>
      <br>
      <p>Best regards,</p>
      <p>The BitFactory Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return { success: false, error };
  }
};

export const sendInvoiceEmail = async (
  email: string,
  customerName: string,
  invoiceNumber: string,
  totalAmount: number,
  dueDate: Date,
  issuedDate: Date,
  ccEmails?: string[],
) => {
  const ccInvoicesEmail = process.env.CC_INVOICES_EMAIL;
  // Build CC list: use provided ccEmails if available, otherwise use default
  const ccList =
    ccEmails && ccEmails.length > 0 ? ccEmails.join(",") : ccInvoicesEmail;
  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    replyTo: REPLY_TO_EMAILS,
    to: email,
    cc: ccList,
    subject: `Invoice ${invoiceNumber} from BitFactory`,
    html: `
      <h1>Invoice Notification</h1>
      <p>Dear ${customerName},</p>
      <p>Your invoice from BitFactory is now ready. Please find the details below:</p>
      <br>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Invoice Number</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${formatCurrency(totalAmount)}</td>
        </tr>
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Issued Date</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${formatDate(issuedDate)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Due Date</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${formatDate(dueDate)}</td>
        </tr>
      </table>
      <br>
      <p>Please log in to your BitFactory account to view the complete invoice details.</p>
      <p><strong>Login URL:</strong> <a href="https://my.bitfactory.ae" target="_blank">my.bitfactory.ae</a></p>
      <br>
      <p>If you have any questions about this invoice, please contact our invoices team at <a href="mailto:${ccInvoicesEmail}">${ccInvoicesEmail}</a>.</p>
      <br>
      <p>Best regards,</p>
      <p>The BitFactory Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending invoice email:", error);
    return { success: false, error };
  }
};

export const sendCronRunSuccessfulEmail = async (userCount: number) => {
  const date = new Date();
  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: process.env.SMTP_USER,
    subject: "Cron run successfully - BitFactory",
    html: `
      <h1>Cron</h1>
      <p>Cost deduction cron run successfully for ${userCount} users.</p>
      <p>Cron ran at ${date}.</p>
      <br>
      <p>Best regards,</p>
      <p>The BitFactory Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending cron success email:", error);
    return { success: false, error };
  }
};

interface PoolCronDaySummary {
  date: string;
  results: Array<{
    pool: string;
    subaccountName: string;
    status: "written" | "pending" | "skipped" | "error";
    error?: string;
    note?: string;
  }>;
}

/**
 * Sends a per-run summary for the pool-history crons (subaccount daily
 * snapshot, and later worker/transaction crons) — every run, not just
 * failures, so a missed/silently-broken run is visible by its absence
 * rather than needing to be noticed in Vercel's logs.
 */
export const sendPoolCronSummaryEmail = async (params: {
  cronName: string;
  days: PoolCronDaySummary[];
}) => {
  const { cronName, days } = params;
  const date = new Date();

  const allResults = days.flatMap((d) => d.results);
  const written = allResults.filter((r) => r.status === "written").length;
  const pending = allResults.filter((r) => r.status === "pending");
  const skipped = allResults.filter((r) => r.status === "skipped").length;
  const errors = allResults.filter((r) => r.status === "error");

  const errorRows = errors
    .map(
      (e) =>
        `<li>${e.pool}/${e.subaccountName}: ${e.error || "unknown error"}</li>`,
    )
    .join("");

  const pendingRows = pending
    .map(
      (p) =>
        `<li>${p.pool}/${p.subaccountName}: ${p.note || "pool hadn't finalized this date yet"}</li>`,
    )
    .join("");

  const dayRows = days
    .map((d) => {
      const dayWritten = d.results.filter((r) => r.status === "written").length;
      const dayPending = d.results.filter((r) => r.status === "pending").length;
      const daySkipped = d.results.filter((r) => r.status === "skipped").length;
      const dayErrors = d.results.filter((r) => r.status === "error").length;
      return `<li>${d.date}: ${dayWritten} written, ${dayPending} pending (not yet finalized by the pool), ${daySkipped} already up to date, ${dayErrors} error(s)</li>`;
    })
    .join("");

  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: process.env.SMTP_USER,
    subject: `${errors.length > 0 ? "⚠️ " : pending.length > 0 ? "⏳ " : ""}Cron run: ${cronName} - BitFactory`,
    html: `
      <h1>${cronName}</h1>
      <p>Ran at ${date.toISOString()}.</p>
      <p><strong>${written}</strong> written, <strong>${pending.length}</strong> pending (pool hasn't finalized yet), <strong>${skipped}</strong> already up to date, <strong>${errors.length}</strong> error(s).</p>
      <h3>Per day</h3>
      <ul>${dayRows}</ul>
      ${
        pending.length > 0
          ? `<h3 style="color:#e6a817;">Pending — not written yet, will retry</h3><ul>${pendingRows}</ul>`
          : ""
      }
      ${
        errors.length > 0
          ? `<h3 style="color:#c62828;">Errors</h3><ul>${errorRows}</ul>`
          : ""
      }
      <br>
      <p>Best regards,</p>
      <p>The BitFactory Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error(`Error sending ${cronName} summary email:`, error);
    return { success: false, error };
  }
};

interface RangeCronSectionSummary {
  subaccountName: string;
  status: "written" | "error";
  fetched: number;
  written: number;
  error?: string;
}

/**
 * Summary email for cron_pool_worker_transactions — its two fetches
 * (worker-level metrics, transaction ledger) each cover a date RANGE per
 * subaccount in one call, rather than one row per day like the other pool
 * crons, so the report is shaped around "per subaccount, per section"
 * rather than "per day".
 */
export const sendWorkerTransactionCronSummaryEmail = async (params: {
  startDate: string;
  endDate: string;
  workerResults: RangeCronSectionSummary[];
  transactionResults: RangeCronSectionSummary[];
}) => {
  const { startDate, endDate, workerResults, transactionResults } = params;
  const date = new Date();

  const section = (label: string, results: RangeCronSectionSummary[]) => {
    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
    const totalWritten = results.reduce((sum, r) => sum + r.written, 0);
    const errors = results.filter((r) => r.status === "error");
    const errorRows = errors
      .map((e) => `<li>${e.subaccountName}: ${e.error || "unknown error"}</li>`)
      .join("");
    return `
      <h3>${label}</h3>
      <p>${results.length} subaccount(s) checked, ${totalFetched} row(s) fetched, ${totalWritten} new row(s) written, ${errors.length} error(s).</p>
      ${errors.length > 0 ? `<ul style="color:#c62828;">${errorRows}</ul>` : ""}
    `;
  };

  const hasErrors =
    workerResults.some((r) => r.status === "error") ||
    transactionResults.some((r) => r.status === "error");

  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: process.env.SMTP_USER,
    subject: `${hasErrors ? "⚠️ " : ""}Cron run: cron_pool_worker_transactions - BitFactory`,
    html: `
      <h1>cron_pool_worker_transactions</h1>
      <p>Ran at ${date.toISOString()}, covering ${startDate} to ${endDate}.</p>
      ${section("Worker-level metrics", workerResults)}
      ${section("Transactions", transactionResults)}
      <br>
      <p>Best regards,</p>
      <p>The BitFactory Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error(
      "Error sending cron_pool_worker_transactions summary email:",
      error,
    );
    return { success: false, error };
  }
};

// Send invoice cancellation email
export const sendInvoiceCancellationEmail = async (
  email: string,
  customerName: string,
  invoiceNumber: string,
  totalAmount: number,
  dueDate: Date,
) => {
  const { generateInvoiceCancellationEmailHTML } =
    await import("./email-templates/cancellation-email");

  const htmlContent = generateInvoiceCancellationEmailHTML(
    customerName,
    invoiceNumber,
    totalAmount,
    dueDate,
  );

  const ccEmail = process.env.CC_INVOICES_EMAIL || "invoices@bitfactory.ae";

  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    replyTo: REPLY_TO_EMAILS,
    to: email,
    cc: ccEmail,
    subject: `Invoice ${invoiceNumber} - Cancellation Notice`,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending invoice cancellation email:", error);
    return { success: false, error };
  }
};

/**
 * Send invoice with PDF attachment and CC to invoices@bitfactory.ae
 */
export const sendInvoiceEmailWithPDF = async (
  email: string,
  customerName: string,
  invoiceNumber: string,
  totalAmount: number | string,
  issuedDate: Date,
  dueDate: Date,
  totalMiners: number,
  unitPrice: number | string,
  invoiceId: string,
  pdfBuffer: Buffer,
  ccEmails?: string[],
  cryptoPaymentUrl?: string | null,
  lineItems?: InvoicePdfLineItem[] | null,
  invoiceType?: string | null,
  hardwareModel?: string | null,
) => {
  try {
    // Load email template
    const emailTemplatePath = join(
      process.cwd(),
      "src/lib/email-templates/invoice-email.html",
    );
    const emailTemplate = readFileSync(emailTemplatePath, "utf-8");

    const hasLineItems = !!(lineItems && lineItems.length > 0);

    // Render email template with invoice data
    const emailData = {
      invoiceNumber,
      customerName,
      status: "ISSUED",
      issuedDate: formatDate(issuedDate),
      dueDate: formatDate(dueDate),
      totalMiners,
      unitPrice: formatCurrency(Number(unitPrice)),
      totalAmount: formatCurrency(Number(totalAmount)),
      cryptoPaymentUrl: cryptoPaymentUrl || "",
      hasCryptoPayment: !!cryptoPaymentUrl,
      hasLineItems,
      lineItemsTable: hasLineItems
        ? buildLineItemsTableHtml(
            totalMiners,
            unitPrice,
            totalAmount,
            hardwareModel,
            lineItems,
            invoiceType,
          )
        : "",
    };

    console.log("[EMAIL] Crypto payment data:", {
      cryptoPaymentUrl,
      hasCryptoPayment: !!cryptoPaymentUrl,
      urlType: typeof cryptoPaymentUrl,
    });

    const htmlContent = renderInvoiceTemplate(emailTemplate, emailData);

    // Build CC list: use provided ccEmails if available, otherwise use default
    const ccList =
      ccEmails && ccEmails.length > 0
        ? ccEmails.join(",")
        : CC_INVOICE_EMAIL || "invoices@bitfactory.ae";
    const mailOptions = {
      from:
        `BitFactory Accounts <${process.env.SMTP_FROM}>` ||
        "noreply@bitfactory.com",
      replyTo: REPLY_TO_EMAILS,
      to: email,
      cc: ccList,
      subject: `Invoice ${invoiceNumber} - BitFactory`,
      html: htmlContent,
      attachments: [
        {
          filename: `Invoice_${invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending invoice email with PDF:", error);
    return { success: false, error };
  }
};

/**
 * Generate PDF from HTML content
 * Uses Puppeteer for server-side rendering
 */
export const generatePDFFromHTML = async (
  htmlContent: string,
): Promise<Buffer> => {
  try {
    // 🔑 Required for PDFs (typings are wrong, runtime is correct)
    // await (chromium as unknown as { fonts: () => Promise<void> }).fonts();
    let browser;
    if (process.env.NODE_ENV === "production") {
      browser = await puppeteerCore.launch({
        headless: true,
        args: chromium.args,
        //
        //   args: [
        //   "--no-sandbox",
        //   "--disable-setuid-sandbox",
        //   "--disable-dev-shm-usage",
        //   "--disable-gpu",
        // ],
        executablePath: await chromium.executablePath(
          `https://github.com/Sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.tar`, //.br
        ),
      });
    } else {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "0.4in", right: "0.4in", bottom: "0.4in", left: "0.4in" },
      printBackground: true,
    });

    await browser.close();
    return pdfBuffer as Buffer;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

const PRODUCT_NAME_LABEL = "Hosting & Colocation Charges";

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface InvoicePdfLineItem {
  model: string;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
  lineItemType?: "HARDWARE" | "HOSTING_COLOCATION";
}

// Hardware rows are always listed above Hosting & Colocation rows on the
// invoice PDF, regardless of the order they were stored/passed in.
const LINE_ITEM_TYPE_RANK: Record<"HARDWARE" | "HOSTING_COLOCATION", number> = {
  HARDWARE: 0,
  HOSTING_COLOCATION: 1,
};

const sortPdfLineItems = (items: InvoicePdfLineItem[]): InvoicePdfLineItem[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rankDiff =
        LINE_ITEM_TYPE_RANK[a.item.lineItemType || "HARDWARE"] -
        LINE_ITEM_TYPE_RANK[b.item.lineItemType || "HARDWARE"];
      return rankDiff !== 0 ? rankDiff : a.index - b.index;
    })
    .map(({ item }) => item);

const buildProductRowsHtml = (
  totalMiners: number,
  unitPrice: number | string,
  totalAmount: number | string,
  hardwareModel?: string | null,
  lineItems?: InvoicePdfLineItem[] | null,
  invoiceType?: string | null,
): string => {
  const rows =
    lineItems && lineItems.length > 0
      ? sortPdfLineItems(lineItems).map((item) => ({
          model: item.model,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
        }))
      : [
          {
            model: hardwareModel || "",
            quantity: totalMiners,
            unitPrice: Number(unitPrice),
            totalPrice: Number(totalAmount),
          },
        ];

  if (invoiceType === "HARDWARE_SALES") {
    // Hardware Sales: Product Name = the model itself, no Machine Name column
    return rows
      .map(
        (row) => `        <tr>
          <td>${escapeHtml(row.model)}</td>
          <td class="text-right">${row.quantity}</td>
          <td class="text-right">${formatCurrency(row.unitPrice)}</td>
          <td class="text-right">${formatCurrency(row.totalPrice)}</td>
        </tr>`,
      )
      .join("\n");
  }

  return rows
    .map(
      (row) => `        <tr>
          <td>${PRODUCT_NAME_LABEL}</td>
          <td>${escapeHtml(row.model)}</td>
          <td class="text-right">${row.quantity}</td>
          <td class="text-right">${formatCurrency(row.unitPrice)}</td>
          <td class="text-right">${formatCurrency(row.totalPrice)}</td>
        </tr>`,
    )
    .join("\n");
};

// Full line-items breakdown table for the invoice notification email body -
// shows each hardware/hosting row separately instead of collapsing them
// into a single "Total Miners x average Unit Price" line, which misrepresents
// the numbers whenever a hosting & colocation charge is mixed in.
const buildLineItemsTableHtml = (
  totalMiners: number,
  unitPrice: number | string,
  totalAmount: number | string,
  hardwareModel: string | null | undefined,
  lineItems: InvoicePdfLineItem[] | null | undefined,
  invoiceType: string | null | undefined,
): string => {
  const rows = buildProductRowsHtml(
    totalMiners,
    unitPrice,
    totalAmount,
    hardwareModel,
    lineItems,
    invoiceType,
  );

  const header =
    invoiceType === "HARDWARE_SALES"
      ? `<tr>
          <th>Model</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Total</th>
        </tr>`
      : `<tr>
          <th>Product</th>
          <th>Model</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Total</th>
        </tr>`;

  return `<table class="line-items-table">
      <thead>${header}</thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
};

interface FooterSectionData {
  companyName?: string | null;
  companyLegalName?: string | null;
  companyLocation?: string | null;
  billingInquiriesEmail?: string | null;
  billingInquiriesWhatsApp?: string | null;
  supportEmail?: string | null;
  supportWhatsApp?: string | null;
}

// Pre-rendered as a single HTML fragment (rather than left as template
// {{#if}} tags) so it can be dropped into either page of the PDF via a
// plain {{footerSectionPageN}} variable - the template's regex-based
// {{#if}} engine doesn't support nested conditionals, and this block has
// four of its own.
const buildFooterSectionHtml = (footer: FooterSectionData): string => {
  const billingEmailRow = footer.billingInquiriesEmail
    ? `<div class="footer-contact-item">Email: <a href="mailto:${escapeHtml(footer.billingInquiriesEmail)}">${escapeHtml(footer.billingInquiriesEmail)}</a></div>`
    : "";
  const billingWhatsAppRow = footer.billingInquiriesWhatsApp
    ? `<div class="footer-contact-item">WhatsApp: ${escapeHtml(footer.billingInquiriesWhatsApp)}</div>`
    : "";
  const supportEmailRow = footer.supportEmail
    ? `<div class="footer-contact-item">Email: <a href="mailto:${escapeHtml(footer.supportEmail)}">${escapeHtml(footer.supportEmail)}</a></div>`
    : "";
  const supportWhatsAppRow = footer.supportWhatsApp
    ? `<div class="footer-contact-item">WhatsApp: ${escapeHtml(footer.supportWhatsApp)}</div>`
    : "";

  return `    <div class="footer-section">
      <div class="footer-contact">
        <div class="footer-contact-title">Direct all Billing Inquiries:</div>
        ${billingEmailRow}
        ${billingWhatsAppRow}
      </div>
      <div class="footer-branding">
        <div class="footer-branding-text">${escapeHtml(footer.companyName || "")}</div>
        <div class="footer-company">${escapeHtml(footer.companyLegalName || "")}</div>
        <div class="footer-company-address">${escapeHtml(footer.companyLocation || "")}</div>
      </div>
      <div class="footer-contact2">
        <div class="footer-contact-title">Direct all Support Inquiries:</div>
        ${supportEmailRow}
        ${supportWhatsAppRow}
      </div>
    </div>`;
};

/**
 * Generate invoice PDF from template
 */
export const generateInvoicePDF = async (
  invoiceNumber: string,
  customerName: string,
  customerEmail: string,
  totalAmount: number | string,
  issuedDate: Date,
  dueDate: Date,
  totalMiners: number,
  unitPrice: number | string,
  invoiceId: string,
  generatedDate: Date,
  cryptoPaymentUrl?: string | null,
  hardwareModel?: string | null,
  billingMonth?: Date | null,
  invoiceStatus?: string | null,
  paidDate?: Date | null,
  lineItems?: InvoicePdfLineItem[] | null,
  invoiceType?: string | null,
  machineHostingLocationOverride?: string | null,
): Promise<Buffer> => {
  try {
    // Load PDF template
    const pdfTemplatePath = join(
      process.cwd(),
      "src/lib/email-templates/invoice-pdf.html",
    );
    const pdfTemplate = readFileSync(pdfTemplatePath, "utf-8");

    // Fetch PaymentDetails from database for dynamic configuration
    let paymentDetails = null;
    try {
      const { prisma } = await import("./prisma");
      paymentDetails = await prisma.paymentDetails.findFirst();
    } catch (dbError) {
      console.warn("Could not fetch PaymentDetails from database:", dbError);
      // Continue with null paymentDetails - template will use conditional rendering
    }

    const normalizedStatus = (invoiceStatus || "ISSUED").toUpperCase();
    const isPaid = normalizedStatus === "PAID";
    const paymentStatusLabel = isPaid ? "PAID" : "UNPAID";
    const paymentStatusTone = isPaid ? "paid" : "unpaid";

    let paidPastDueLabel = "N/A";
    let paidPastDueTone = "neutral";

    if (isPaid && paidDate) {
      const daysPastDue = Math.ceil(
        (new Date(paidDate).getTime() - new Date(dueDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (daysPastDue > 0) {
        paidPastDueLabel = `${daysPastDue} day${daysPastDue === 1 ? "" : "s"} late`;
        paidPastDueTone = "late";
      } else if (daysPastDue === 0) {
        paidPastDueLabel = "On time";
        paidPastDueTone = "ontime";
      } else {
        const daysEarly = Math.abs(daysPastDue);
        paidPastDueLabel = `${daysEarly} day${daysEarly === 1 ? "" : "s"} early`;
        paidPastDueTone = "ontime";
      }
    }

    // Invoice PDFs get a second page (Terms & Conditions) only for
    // Hardware Sales invoices - the footer moves to the bottom of that
    // second page for those, and stays on the single page otherwise.
    const isHardwareSales = invoiceType === "HARDWARE_SALES";
    const footerSectionHtml = buildFooterSectionHtml({
      companyName: paymentDetails?.companyName,
      companyLegalName: paymentDetails?.companyLegalName,
      companyLocation: paymentDetails?.companyLocation,
      billingInquiriesEmail: paymentDetails?.billingInquiriesEmail,
      billingInquiriesWhatsApp: paymentDetails?.billingInquiriesWhatsApp,
      supportEmail: paymentDetails?.supportEmail,
      supportWhatsApp: paymentDetails?.supportWhatsApp,
    });

    // Render PDF template with invoice data and payment details
    const pdfData: Record<
      string,
      string | number | null | undefined | boolean
    > = {
      invoiceNumber,
      customerName,
      customerEmail,
      status: "ISSUED",
      statusLower: "issued",
      issuedDate: formatDate(issuedDate),
      dueDate: formatDate(dueDate),
      totalMiners,
      unitPrice: formatCurrency(Number(unitPrice)),
      totalAmount: formatCurrency(Number(totalAmount)),
      productRows: buildProductRowsHtml(
        totalMiners,
        unitPrice,
        totalAmount,
        hardwareModel,
        lineItems,
        invoiceType,
      ),
      isHardwareSales,
      footerSectionPage1: isHardwareSales ? "" : footerSectionHtml,
      footerSectionPage2: isHardwareSales ? footerSectionHtml : "",
      invoiceId,
      generatedDate: formatDate(generatedDate),
      cryptoPaymentUrl: cryptoPaymentUrl || "",
      hasCryptoPayment: !!cryptoPaymentUrl,
      hardwareModel: hardwareModel || "",
      paymentStatusLabel,
      paymentStatusTone,
      paidPastDueLabel,
      paidPastDueTone,
      billingMonth: billingMonth
        ? new Date(billingMonth).toLocaleDateString("en-US", {
            timeZone: "UTC",
            year: "numeric",
            month: "long",
          })
        : "N/A",
      // Add PaymentDetails if available - include all fields as-is
      ...(paymentDetails
        ? {
            companyName: paymentDetails.companyName,
            companyLegalName: paymentDetails.companyLegalName,
            companyLocation: paymentDetails.companyLocation,
            machineHostingLocation: paymentDetails.machineHostingLocation,
            logoBase64: paymentDetails.logoBase64,
            billingInquiriesEmail: paymentDetails.billingInquiriesEmail,
            billingInquiriesWhatsApp: paymentDetails.billingInquiriesWhatsApp,
            supportEmail: paymentDetails.supportEmail,
            supportWhatsApp: paymentDetails.supportWhatsApp,
            paymentOption1Title: paymentDetails.paymentOption1Title,
            paymentOption1Details: paymentDetails.paymentOption1Details,
            paymentOption2Title: paymentDetails.paymentOption2Title,
            paymentOption2Details: paymentDetails.paymentOption2Details,
            paymentOption3Title: paymentDetails.paymentOption3Title,
            paymentOption3Details: paymentDetails.paymentOption3Details,
          }
        : {}),
      // Per-invoice override wins over the global PaymentDetails default
      ...(machineHostingLocationOverride
        ? { machineHostingLocation: machineHostingLocationOverride }
        : {}),
    };

    console.log(
      "[PDF] PaymentDetails loaded:",
      paymentDetails
        ? {
            companyName: paymentDetails.companyName,
            paymentOption1Title: paymentDetails.paymentOption1Title,
            paymentOption2Title: paymentDetails.paymentOption2Title,
            paymentOption3Title: paymentDetails.paymentOption3Title,
          }
        : "none",
    );

    console.log("[PDF] Crypto payment data:", {
      cryptoPaymentUrl,
      hasCryptoPayment: !!cryptoPaymentUrl,
      urlType: typeof cryptoPaymentUrl,
    });

    const htmlContent = renderInvoiceTemplate(pdfTemplate, pdfData);
    console.log("[PDF] Template rendered successfully, generating PDF...");

    const pdfBuffer = await generatePDFFromHTML(htmlContent);
    console.log(
      "[PDF] PDF generated successfully, size:",
      pdfBuffer.length,
      "bytes",
    );

    return pdfBuffer;
  } catch (error) {
    console.error("Error generating invoice PDF:", error);
    throw error;
  }
};

export interface MemoPdfData {
  memoNumber: string;
  customerName: string;
  customerEmail: string;
  category: "HOSTING" | "HARDWARE";
  amount: number;
  reason: string;
  issuedDate: Date;
  invoiceNumber?: string | null;
}

/**
 * Generate a memo PDF from its own dedicated template (not the invoice
 * template - a memo is a single amount + reason, not a line-itemized bill).
 * A positive amount increases the customer's balance (debits our revenue,
 * titled "DEBIT MEMO"); a negative amount decreases it (credits our revenue
 * back, titled "CREDIT MEMO").
 */
export const generateMemoPDF = async (data: MemoPdfData): Promise<Buffer> => {
  const templatePath = join(
    process.cwd(),
    "src/lib/email-templates/memo-pdf.html",
  );
  const template = readFileSync(templatePath, "utf-8");

  let paymentDetails = null;
  try {
    const { prisma } = await import("./prisma");
    paymentDetails = await prisma.paymentDetails.findFirst();
  } catch (dbError) {
    console.warn("Could not fetch PaymentDetails for memo PDF:", dbError);
  }

  const categoryLabel =
    data.category === "HOSTING" ? "Hosting & Colocation" : "Hardware Sales";
  const absAmount = Math.abs(data.amount);
  const isDebit = data.amount >= 0;
  const amountTone = isDebit ? "debit" : "credit";
  const amountLabel = isDebit ? "Debit Amount" : "Credit Amount";
  const memoTitleLabel = isDebit ? "DEBIT MEMO" : "CREDIT MEMO";

  const pdfData: Record<string, string | number | null | undefined | boolean> =
    {
      memoNumber: data.memoNumber,
      memoTitleLabel,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      categoryLabel,
      issuedDate: formatDate(data.issuedDate),
      invoiceNumber: data.invoiceNumber || "",
      hasInvoiceNumber: !!data.invoiceNumber,
      amountFormatted: formatCurrency(absAmount),
      amountLabel,
      amountTone,
      reason: escapeHtml(data.reason),
      ...(paymentDetails
        ? {
            companyName: paymentDetails.companyName,
            companyLegalName: paymentDetails.companyLegalName,
            companyLocation: paymentDetails.companyLocation,
            billingInquiriesEmail: paymentDetails.billingInquiriesEmail,
            billingInquiriesWhatsApp: paymentDetails.billingInquiriesWhatsApp,
            supportEmail: paymentDetails.supportEmail,
            supportWhatsApp: paymentDetails.supportWhatsApp,
          }
        : {
            companyName: "BitFactory.AE",
            companyLegalName: "Higgs Computing Limited",
            companyLocation: "Ras Al Khaimah, UAE",
            billingInquiriesEmail: "invoices@bitfactory.ae",
            billingInquiriesWhatsApp: "",
            supportEmail: "support@bitfactory.ae",
            supportWhatsApp: "",
          }),
    };

  const htmlContent = renderInvoiceTemplate(template, pdfData);
  return generatePDFFromHTML(htmlContent);
};

/**
 * Send a customer-facing memo notice with the PDF attached.
 */
export const sendMemoEmail = async (
  email: string,
  customerName: string,
  memoNumber: string,
  amount: number,
  reason: string,
  pdfBuffer: Buffer,
  invoiceNumber?: string | null,
) => {
  try {
    const { generateMemoEmailHTML } =
      await import("./email-templates/memo-email");

    const htmlContent = generateMemoEmailHTML(
      customerName,
      memoNumber,
      amount,
      reason,
      invoiceNumber,
    );

    const memoTitleLabel = amount >= 0 ? "Debit Memo" : "Credit Memo";

    const mailOptions = {
      from:
        `BitFactory Accounts <${process.env.SMTP_FROM}>` ||
        "noreply@bitfactory.com",
      replyTo: REPLY_TO_EMAILS,
      to: email,
      cc: CC_INVOICE_EMAIL,
      subject: `${memoTitleLabel} ${memoNumber} - BitFactory`,
      html: htmlContent,
      attachments: [
        {
          filename: `${memoTitleLabel.replace(" ", "")}_${memoNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending memo email:", error);
    return { success: false, error };
  }
};
