import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { generatePDFFromHTML, renderInvoiceTemplate } from "@/lib/email";
import { readFileSync } from "fs";
import { join } from "path";
import nodemailer from "nodemailer";
import { InvoiceEmailService } from "@/services/invoiceEmailService";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const { customerId } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can send emails" },
        { status: 403 },
      );
    }

    const { emailTone, emailBody, customerName } = await request.json();

    if (!emailTone || !["normal", "reminder", "final"].includes(emailTone)) {
      return NextResponse.json(
        { error: "Invalid email tone" },
        { status: 400 },
      );
    }

    if (!emailBody || emailBody.trim() === "") {
      return NextResponse.json(
        { error: "Email body is required" },
        { status: 400 },
      );
    }

    // Fetch customer
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        luxorSubaccountName: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    if (!customer.email) {
      return NextResponse.json(
        { error: "Customer email not available" },
        { status: 400 },
      );
    }

    // Get all invoices for the customer (excluding CANCELLED)
    const invoices = await prisma.invoice.findMany({
      where: {
        userId: customerId,
        status: { not: "CANCELLED" },
      },
      include: {
        costPayments: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Load PDF template
    const templatePath = join(
      process.cwd(),
      "src/lib/email-templates/customer-statement.html",
    );
    const template = readFileSync(templatePath, "utf-8");

    // Format dates
    const formatDate = (date: Date) =>
      date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

    const formatDateShort = (date: Date) =>
      date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

    // Build invoice rows HTML
    const invoiceRows = invoices
      .map((invoice) => {
        const issuedDateStr = invoice.issuedDate
          ? formatDateShort(new Date(invoice.issuedDate))
          : formatDateShort(new Date(invoice.invoiceGeneratedDate));

        const dueDate = formatDateShort(new Date(invoice.dueDate));

        const totalAmount = Number(invoice.totalAmount);
        const paidAmount = invoice.costPayments.reduce(
          (sum, p) => sum + p.amount,
          0,
        );

        // Calculate outstanding (only for ISSUED/OVERDUE invoices)
        const outstanding =
          invoice.status === "ISSUED" || invoice.status === "OVERDUE"
            ? Math.max(0, totalAmount - paidAmount)
            : 0;

        const invoiceType =
          invoice.invoiceType === "HARDWARE_PURCHASE"
            ? "Hardware"
            : "Hosting & Electricity";

        const statusClass = `status-${invoice.status}`;

        return `
      <tr>
        <td><strong>${invoice.invoiceNumber}</strong></td>
        <td>${issuedDateStr}</td>
        <td>${dueDate}</td>
        <td>${invoiceType}</td>
        <td class="text-right">$${totalAmount.toFixed(2)}</td>
        <td class="text-right">$${paidAmount.toFixed(2)}</td>
        <td class="text-right">$${outstanding.toFixed(2)}</td>
        <td><span class="status-badge ${statusClass}">${invoice.status}</span></td>
      </tr>
    `;
      })
      .join("");

    // Calculate totals (only ISSUED invoices for outstanding)
    const totalAmount = invoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount),
      0,
    );
    const totalPaid = invoices.reduce((sum, inv) => {
      const paid = inv.costPayments.reduce((pSum, p) => pSum + p.amount, 0);
      return sum + paid;
    }, 0);
    const issuedInvoices = invoices.filter(
      (inv) => inv.status === "ISSUED" || inv.status === "OVERDUE",
    );
    const issuedTotalAmount = issuedInvoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount),
      0,
    );
    const issuedTotalPaid = issuedInvoices.reduce((sum, inv) => {
      const paid = inv.costPayments.reduce((pSum, p) => pSum + p.amount, 0);
      return sum + paid;
    }, 0);
    const totalOutstanding = issuedTotalAmount - issuedTotalPaid;

    // Fetch PaymentDetails from database for dynamic configuration
    let paymentDetails = null;
    try {
      paymentDetails = await prisma.paymentDetails.findFirst();
    } catch (dbError) {
      console.warn("Could not fetch PaymentDetails from database:", dbError);
    }

    const statementData: Record<
      string,
      string | number | null | undefined | boolean
    > = {
      customerName: customer.name || "Valued Customer",
      customerEmail: customer.email || "",
      customerID: customer.id,
      generatedDate: formatDate(new Date()),
      totalInvoices: invoices.length.toString(),
      totalAmount: `$${totalAmount.toFixed(2)}`,
      totalPaid: `$${totalPaid.toFixed(2)}`,
      totalOutstanding: `$${totalOutstanding.toFixed(2)}`,
      invoiceRows:
        invoiceRows ||
        "<tr><td colspan='7' style='padding: 20px; text-align: center; color: #666;'>No invoices found for this customer</td></tr>",
      // Add PaymentDetails if available
      ...(paymentDetails
        ? {
            logoBase64: paymentDetails.logoBase64,
            billingInquiriesEmail: paymentDetails.billingInquiriesEmail,
            billingInquiriesWhatsApp: paymentDetails.billingInquiriesWhatsApp,
            supportEmail: paymentDetails.supportEmail,
            supportWhatsApp: paymentDetails.supportWhatsApp,
            companyName: paymentDetails.companyName,
            companyLegalName: paymentDetails.companyLegalName,
            companyLocation: paymentDetails.companyLocation,
          }
        : {
            logoBase64: "",
            billingInquiriesEmail: "invoices@bitfactory.ae",
            billingInquiriesWhatsApp: "+971-52-6062903",
            supportEmail: "support@bitfactory.ae",
            supportWhatsApp: "+971-52-6062903",
            companyName: "BitFactory.AE",
            companyLegalName: "Higgs Computing Limited",
            companyLocation: "Ras Al Khaimah, UAE",
          }),
    };

    const htmlContent = renderInvoiceTemplate(
      template,
      statementData as Record<
        string,
        string | number | boolean | null | undefined
      >,
    );
    const pdfBuffer = await generatePDFFromHTML(htmlContent);

    // Get subject and header based on tone
    const toneConfig = {
      normal: {
        subject: `Account Statement - ${customer.name}`,
        header: "Account Statement",
      },
      reminder: {
        subject: `PAYMENT REMINDER - Outstanding Balance - ${customer.name}`,
        header: "Payment Reminder Notice",
      },
      final: {
        subject: `FINAL NOTICE - Immediate Payment Required - ${customer.name}`,
        header: "Final Notice - Immediate Action Required",
      },
    };

    const config = toneConfig[emailTone as keyof typeof toneConfig];

    // Build CC list (includes RM and invoices@bitfactory.ae)
    const ccEmails = await InvoiceEmailService.buildCCList(
      customer.luxorSubaccountName,
    );

    // Create nodemailer transporter
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

    // Process email body: extract link and format as HTML
    const emailBodyLines = emailBody
      .split("\n")
      .filter((line: string) => line.trim());
    let htmlBodyContent = "";

    // Convert lines to HTML paragraphs (skip "Dear" line which is already shown)
    htmlBodyContent = emailBodyLines
      .filter((line: string) => !line.trim().startsWith("Dear"))
      .map((line: string) => `<p>${line.trim()}</p>`)
      .join("");

    // Replace http://bitfactory.ae/ with clickable link in the body
    htmlBodyContent = htmlBodyContent.replace(
      /http:\/\/bitfactory\.ae\/?/g,
      '<a href="http://bitfactory.ae/" style="color: #1976d2; text-decoration: none; font-weight: bold;">BitFactory.AE</a>',
    );

    // Send email
    const mailOptions = {
      from:
        `BitFactory Accounts <${process.env.SMTP_FROM}>` ||
        "noreply@bitfactory.com",
      to: customer.email,
      cc: ccEmails.join(","),
      subject: config.subject,
      html: `
        <html>
          <head><meta charset="UTF-8"></head>
          <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <p>Dear <strong>${customerName || customer.name}</strong>,</p>
              
              <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #1976d2; margin: 20px 0;">
                ${htmlBodyContent}
              </div>
              
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #1976d2;">Account Summary</h3>
                <p><strong>Total Invoices:</strong> ${invoices.length}</p>
                <p><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>
                <p><strong>Total Paid:</strong> $${totalPaid.toFixed(2)}</p>
                <p style="color: #d32f2f;"><strong>Outstanding Balance:</strong> $${totalOutstanding.toFixed(2)}</p>
              </div>
              
              <p>Please find your complete account statement attached to this email for your records.</p>
              
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                If you have any questions or concerns, please don't hesitate to contact us at 
                <strong>${paymentDetails?.billingInquiriesEmail || "invoices@bitfactory.ae"}</strong>
              </p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                This is an automated email. Please do not reply to this message.
              </p>
            </div>
          </body>
        </html>
      `,
      attachments: [
        {
          filename: `statement-${(customer.name || "customer")
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")}-${new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, "")}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    try {
      const sendResult = await transporter.sendMail(mailOptions);
      console.log("[Statement Email] Email sent successfully:", sendResult);
    } catch (emailError) {
      console.error("[Statement Email] Error sending mail:", emailError);
      throw new Error(
        `Failed to send email: ${emailError instanceof Error ? emailError.message : String(emailError)}`,
      );
    }

    // Create notification record (use existing notification type)
    try {
      // Use a UUID-like ID for statement email notifications
      const { v4: uuidv4 } = await import("uuid");
      await prisma.invoiceNotification.create({
        data: {
          invoiceId: `STMT-${uuidv4()}`, // Create a unique ID for this statement email
          notificationType: "INVOICE_ISSUED",
          sentTo: customer.email,
          sentAt: new Date(),
          status: "SENT",
          ccEmails: ccEmails.join(","),
        },
      });
    } catch (dbError) {
      console.warn(
        "[Statement Email] Could not create notification record:",
        dbError,
      );
      // Don't fail the entire operation if notification fails
    }

    // Log audit (use existing audit action)
    try {
      await prisma.auditLog.create({
        data: {
          action: "INVOICE_SENT_TO_CUSTOMER",
          entityType: "Statement",
          entityId: customerId,
          userId,
          description: `Statement (${emailTone} tone) sent to ${customer.email}`,
          changes: JSON.stringify({
            sentTo: customer.email,
            ccEmails: ccEmails.join(","),
            emailTone,
            pdfAttached: true,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (auditError) {
      console.warn("[Statement Email] Could not create audit log:", auditError);
      // Don't fail the entire operation if audit log fails
    }

    return NextResponse.json({
      success: true,
      message: `Statement sent successfully to ${customer.email}`,
      sentTo: customer.email,
      ccEmails,
    });
  } catch (error) {
    console.error("[Statement Email] Error in route handler:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to send statement email",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
