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
  process.env.INVOICE_CC_EMAIL || "invoices@bitfactory.ae";

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
          <td style="padding: 10px; border: 1px solid #ddd;">$${totalAmount.toFixed(2)}</td>
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

  const ccEmail = process.env.INVOICE_CC_EMAIL || "invoices@bitfactory.ae";

  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
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
) => {
  try {
    // Load email template
    const emailTemplatePath = join(
      process.cwd(),
      "src/lib/email-templates/invoice-email.html",
    );
    const emailTemplate = readFileSync(emailTemplatePath, "utf-8");

    // Render email template with invoice data
    const emailData = {
      invoiceNumber,
      customerName,
      status: "ISSUED",
      issuedDate: formatDate(issuedDate),
      dueDate: formatDate(dueDate),
      totalMiners,
      unitPrice: `$${Number(unitPrice).toFixed(2)}`,
      totalAmount: `$${Number(totalAmount).toFixed(2)}`,
      cryptoPaymentUrl: cryptoPaymentUrl || "",
      hasCryptoPayment: !!cryptoPaymentUrl,
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
      unitPrice: `$${Number(unitPrice).toFixed(2)}`,
      totalAmount: `$${Number(totalAmount).toFixed(2)}`,
      invoiceId,
      generatedDate: formatDate(generatedDate),
      cryptoPaymentUrl: cryptoPaymentUrl || "",
      hasCryptoPayment: !!cryptoPaymentUrl,
      hardwareModel: hardwareModel || "",
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
