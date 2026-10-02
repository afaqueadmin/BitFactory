import { NextRequest, NextResponse } from "next/server";
import { generateInvoicePDF } from "@/lib/email";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * Test endpoint to preview invoice PDF with sample data
 * Usage: GET /api/test/preview-invoice-pdf
 * Admins only (N-16: was open to anyone, signed in or not).
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  let role: string | null = null;
  try {
    if (token) ({ role } = await verifyJwtToken(token));
  } catch {
    role = null;
  }
  if (!role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  try {
    console.log("[Preview PDF] Generating sample invoice PDF...");

    // Generate sample PDF with test data
    const pdfBuffer = await generateInvoicePDF(
      "INV-2026-00001", // invoiceNumber
      "Test Customer", // customerName
      "test@example.com", // customerEmail
      2500, // totalAmount
      new Date("2026-02-01"), // issuedDate
      new Date("2026-03-01"), // dueDate
      10, // totalMiners
      250, // unitPrice
      "test-invoice-id-123", // invoiceId
      new Date(), // generatedDate
      null, // cryptoPaymentUrl
      "Bitmain S21 Pro", // hardwareModel (sample)
      new Date("2026-03-01"), // billingMonth (sample)
      "PAID", // invoiceStatus (sample)
      new Date("2026-03-04"), // paidDate (sample)
    );

    console.log(
      "[Preview PDF] PDF generated successfully, size:",
      pdfBuffer.length,
      "bytes",
    );

    // Return PDF as downloadable file
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="preview-invoice.pdf"',
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[Preview PDF] Error generating PDF:", error);
    return NextResponse.json(
      {
        error: "Failed to generate preview PDF",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
