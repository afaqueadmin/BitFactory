import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { generateInvoicePDF } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await verifyJwtToken(token);

    const invoiceId = id;

    // Fetch invoice from database
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Get user details from database to check role
    const user = await prisma.user.findUnique({
      where: { id: userId.userId },
      select: { id: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Check if user has permission to download this invoice
    // Users can download their own invoices, admins can download any invoice
    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
    const isOwnInvoice = invoice.userId === userId.userId;

    if (!isAdmin && !isOwnInvoice) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(
      invoice.invoiceNumber,
      invoice.user?.name || "Valued Customer",
      invoice.user?.email || "",
      Number(invoice.totalAmount),
      invoice.issuedDate || new Date(),
      invoice.dueDate,
      invoice.totalMiners,
      Number(invoice.unitPrice),
      invoice.id,
      new Date(),
    );

    // Return PDF as file download
    return new NextResponse(pdfBuffer as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error generating invoice PDF download:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
