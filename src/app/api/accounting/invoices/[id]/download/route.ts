import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { resolveDataOwnerId } from "@/lib/guildScope";
import { prisma } from "@/lib/prisma";
import { InvoiceStatus } from "@prisma/client";
import { REPAIR_MINER_SELECT } from "@/lib/accounting/hardwareRepair";
import { generateInvoicePDF, repairDetailsFromInvoice } from "@/lib/email";
import { isSimulatedRole } from "@/lib/simulation/config";
import { simRoute } from "@/lib/simulation/context";
import {
  SIM_INVOICE_ID,
  hasRealIssuedInvoice,
  loadSimInvoice,
} from "@/lib/simulation/invoice";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: invoiceId } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await verifyJwtToken(token);

    // Simulated accounts: their view-only invoice, rendered from code, until
    // an admin issues them a real one. Real ids go through the normal path.
    const sim =
      invoiceId === SIM_INVOICE_ID &&
      isSimulatedRole(userId.role) &&
      !(await hasRealIssuedInvoice(userId.userId))
        ? await simRoute(userId, async (ctx) => {
            const inv = await loadSimInvoice(ctx);
            const pdf = await generateInvoicePDF(
              inv.invoiceNumber,
              inv.user.name || "Valued Customer",
              inv.user.email,
              inv.totalAmount,
              inv.issuedDate,
              inv.dueDate,
              inv.totalMiners,
              inv.unitPrice,
              inv.id,
              new Date(),
              null,
              ctx.demoMiner.hardware.model,
              inv.billingMonth,
              inv.status,
              inv.paidDate,
              inv.lineItems.map((li) => ({
                model: li.model,
                quantity: li.quantity,
                unitPrice: li.unitPrice,
                totalPrice: li.totalPrice,
                lineItemType: li.lineItemType,
                hardwareId: li.hardwareId,
                billingMonth: li.billingMonth,
                id: li.id,
                parentLineItemId: li.parentLineItemId,
              })),
              inv.invoiceType,
              inv.machineHostingLocation,
              null,
            );
            return new NextResponse(pdf as unknown as ArrayBuffer, {
              headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="invoice-${inv.invoiceNumber}.pdf"`,
                "Cache-Control": "no-cache, no-store, must-revalidate",
              },
            });
          })
        : null;
    if (sim) return sim;

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
        lineItems: true,
        miner: { select: REPAIR_MINER_SELECT },
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
    const isAdmin = isStaffRole(user.role);
    // A Guildmember's own invoices are the guild's (the Guildmaster's).
    const isOwnInvoice = invoice.userId === (await resolveDataOwnerId(userId));

    if (!isAdmin && !isOwnInvoice) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Customers never see drafts (list/detail hide them too); answer as not
    // found so the draft's existence isn't revealed.
    if (!isAdmin && invoice.status === InvoiceStatus.DRAFT) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Fetch hardware model if invoice has hardware
    let hardwareModel: string | null = null;
    if (invoice.hardwareId) {
      const hardware = await prisma.hardware.findUnique({
        where: { id: invoice.hardwareId },
        select: { model: true },
      });
      hardwareModel = hardware?.model || null;
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
      null, // cryptoPaymentUrl
      hardwareModel,
      invoice.billingMonth,
      invoice.status,
      invoice.paidDate,
      invoice.lineItems.map((li) => ({
        model: li.model,
        quantity: li.quantity,
        unitPrice: Number(li.unitPrice),
        totalPrice: Number(li.totalPrice),
        lineItemType: li.lineItemType,
        hardwareId: li.hardwareId,
        billingMonth: li.billingMonth,
        id: li.id,
        parentLineItemId: li.parentLineItemId,
      })),
      invoice.invoiceType,
      invoice.machineHostingLocation,
      repairDetailsFromInvoice(invoice),
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
