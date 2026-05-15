import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { generatePDFFromHTML, renderInvoiceTemplate } from "@/lib/email";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jwtPayload = await verifyJwtToken(token);
    const userId = jwtPayload.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        userId,
        status: {
          in: ["PAID", "ISSUED", "OVERDUE"],
        },
      },
      include: {
        costPayments: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const templatePath = join(
      process.cwd(),
      "src/lib/email-templates/customer-statement.html",
    );
    const template = readFileSync(templatePath, "utf-8");

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

    const invoiceRows = invoices
      .map((invoice) => {
        const issuedDateStr = invoice.issuedDate
          ? formatDateShort(new Date(invoice.issuedDate))
          : formatDateShort(new Date(invoice.invoiceGeneratedDate));

        const dueDate = formatDateShort(new Date(invoice.dueDate));

        const totalAmount = Number(invoice.totalAmount);
        const paidAmount = invoice.costPayments.reduce(
          (sum, payment) => sum + payment.amount,
          0,
        );

        const outstanding =
          invoice.status === "ISSUED" || invoice.status === "OVERDUE"
            ? Math.max(0, totalAmount - paidAmount)
            : 0;

        const invoiceType =
          invoice.invoiceType === "HARDWARE_PURCHASE"
            ? "Hardware"
            : "Hosting & Electricity";

        const statusClass = `status-${invoice.status}`;

        let paidPastDueDaysStr = "-";
        if (invoice.status === "PAID" && invoice.paidDate && invoice.dueDate) {
          const days = Math.max(
            0,
            Math.ceil(
              (new Date(invoice.paidDate).getTime() -
                new Date(invoice.dueDate).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          );
          paidPastDueDaysStr = `<span style="color: #c62828; font-weight: bold; background-color: #fdecea; padding: 2px 6px; border-radius: 999px; border: 1px solid #f44336; white-space: nowrap; font-size: 11px;">${days} days</span>`;
        }

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
        <td>${invoice.status === "PAID" ? paidPastDueDaysStr : "-"}</td>
      </tr>
    `;
      })
      .join("");

    const totalAmount = invoices.reduce(
      (sum, invoice) => sum + Number(invoice.totalAmount),
      0,
    );
    const totalPaid = invoices.reduce((sum, invoice) => {
      const paid = invoice.costPayments.reduce(
        (paymentSum, payment) => paymentSum + payment.amount,
        0,
      );
      return sum + paid;
    }, 0);

    const issuedInvoices = invoices.filter(
      (invoice) => invoice.status === "ISSUED" || invoice.status === "OVERDUE",
    );
    const issuedTotalAmount = issuedInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.totalAmount),
      0,
    );
    const issuedTotalPaid = issuedInvoices.reduce((sum, invoice) => {
      const paid = invoice.costPayments.reduce(
        (paymentSum, payment) => paymentSum + payment.amount,
        0,
      );
      return sum + paid;
    }, 0);
    const totalOutstanding = issuedTotalAmount - issuedTotalPaid;

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
      customerName: user.name || "Valued Customer",
      customerEmail: user.email || "",
      customerID: user.id,
      generatedDate: formatDate(new Date()),
      totalInvoices: invoices.length.toString(),
      totalAmount: `$${totalAmount.toFixed(2)}`,
      totalPaid: `$${totalPaid.toFixed(2)}`,
      totalOutstanding: `$${totalOutstanding.toFixed(2)}`,
      invoiceRows:
        invoiceRows ||
        "<tr><td colspan='8' style='padding: 20px; text-align: center; color: #666;'>No invoices found for this customer</td></tr>",
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

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const customerNameSanitized = (user.name || "customer")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    return new NextResponse(pdfBuffer as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="statement-${customerNameSanitized}-${dateStr}.pdf"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error generating statement PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate statement PDF" },
      { status: 500 },
    );
  }
}
