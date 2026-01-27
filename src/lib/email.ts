import nodemailer from "nodemailer";
import { readFileSync } from "fs";
import { join } from "path";

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
 */
const renderInvoiceTemplate = (
  template: string,
  data: Record<string, string | number>,
): string => {
  let html = template;
  Object.keys(data).forEach((key) => {
    const regex = new RegExp(`{{${key}}}`, "g");
    html = html.replace(regex, String(data[key]));
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
) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const ccInvoicesEmail = process.env.CC_INVOICES_EMAIL;
  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: email,
    cc: ccInvoicesEmail,
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
      <p>If you have any questions about this invoice, please contact our invoices team at <a href="mailto:${CC_INVOICE_EMAIL}">${CC_INVOICE_EMAIL}</a>.</p>
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
  const { generateInvoiceCancellationEmailHTML } = await import(
    "./email-templates/cancellation-email"
  );

  const htmlContent = generateInvoiceCancellationEmailHTML(
    customerName,
    invoiceNumber,
    totalAmount,
    dueDate,
  );

  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: email,
    cc: CC_INVOICE_EMAIL,
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
    };

    const htmlContent = renderInvoiceTemplate(emailTemplate, emailData);

    const mailOptions = {
      from:
        `BitFactory Accounts <${process.env.SMTP_FROM}>` ||
        "noreply@bitfactory.com",
      to: email,
      cc: CC_INVOICE_EMAIL,
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
 * Calls the backend PDF generation API route
 */
export const generatePDFFromHTML = async (
  htmlContent: string,
): Promise<Buffer> => {
  try {
    // Determine the base URL for the fetch request
    const baseUrl =
      process.env.NODE_ENV === "production"
        ? // process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          `https://my.bitfactory.ae`
        : "http://localhost:3000";

    const url = new URL("/api/pdf/generate", baseUrl);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ htmlContent }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate PDF: ${response.statusText}`);
    }

    // Get the PDF as a buffer from the binary response
    const pdfBuffer = await response.arrayBuffer();
    return Buffer.from(pdfBuffer);
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
): Promise<Buffer> => {
  try {
    // Load PDF template
    const pdfTemplatePath = join(
      process.cwd(),
      "src/lib/email-templates/invoice-pdf.html",
    );
    const pdfTemplate = readFileSync(pdfTemplatePath, "utf-8");

    // Render PDF template with invoice data
    const pdfData = {
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
    };

    const htmlContent = renderInvoiceTemplate(pdfTemplate, pdfData);
    const pdfBuffer = await generatePDFFromHTML(htmlContent);

    return pdfBuffer;
  } catch (error) {
    console.error("Error generating invoice PDF:", error);
    throw error;
  }
};
