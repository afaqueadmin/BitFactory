import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { generatePDFFromHTML, renderInvoiceTemplate } from "@/lib/email";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
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
        { error: "Only administrators can access statements" },
        { status: 403 },
      );
    }

    const { customerId } = await params;

    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, email: true, name: true, companyName: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
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
      // Continue with null paymentDetails - template will use conditional rendering
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
      // Add PaymentDetails if available - include all fields as-is
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

    // Generate filename: statement-customerName-YYYYMMDD.pdf
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const customerNameSanitized = (customer.name || "customer")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    // Return PDF as file download
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
