import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { Decimal } from "@prisma/client/runtime/library";
import { AuditAction, Prisma } from "@prisma/client";
import {
  cleanFileName,
  verifyUploadedPdf,
  verifyUploadedSheet,
} from "@/lib/storage/r2";
import {
  checkVendorForInvoice,
  vendorSelect,
} from "@/lib/accounting/vendorRules";
import {
  formatIsoDate,
  resolveExportTimeZone,
  utcDayStart,
} from "@/lib/helpers/admin/tableExport";
import { parseHardwarePurchaseQuery } from "./query";

interface CreateHardwarePurchaseRequest {
  invoiceNumber: string;
  vendorId: string;
  hardwareDescription: string;
  billingDate: string;
  dueDate: string;
  quantity: number;
  unitPrice: number;
  miscellaneousCharges: number;
  /** Optional; part of totalAmount but not a hardware cost. */
  securityDeposit?: number;
  totalAmount: number;
  notes?: string;
  invoicePdfKey: string;
  /** Original filename of the PDF. */
  invoicePdfName?: string;
  /** Optional Excel/CSV sheet sent with the invoice, and its filename. */
  invoiceSheetKey?: string | null;
  invoiceSheetName?: string;
}

export async function POST(request: NextRequest) {
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

    if (!user || !isStaffRole(user.role)) {
      return NextResponse.json(
        { error: "Only administrators can create hardware purchase invoices" },
        { status: 403 },
      );
    }

    const body: CreateHardwarePurchaseRequest = await request.json();

    // Validate required fields
    if (
      !body.invoiceNumber ||
      !body.vendorId ||
      !body.hardwareDescription ||
      !body.billingDate ||
      !body.dueDate ||
      body.quantity < 0 ||
      body.unitPrice < 0
    ) {
      return NextResponse.json(
        { error: "Missing or invalid required fields" },
        { status: 400 },
      );
    }

    const vendor = await checkVendorForInvoice(body.vendorId, "hardware");
    if ("error" in vendor) {
      return NextResponse.json({ error: vendor.error }, { status: 400 });
    }

    const securityDeposit = Number(body.securityDeposit ?? 0);
    if (!Number.isFinite(securityDeposit) || securityDeposit < 0) {
      return NextResponse.json(
        { error: "Security deposit cannot be negative" },
        { status: 400 },
      );
    }

    // Check if invoice number already exists
    const existingInvoice = await prisma.hardwarePurchaseInvoice.findUnique({
      where: { invoiceNumber: body.invoiceNumber },
    });

    if (existingInvoice) {
      return NextResponse.json(
        { error: "Invoice number already exists" },
        { status: 400 },
      );
    }

    if (!body.invoicePdfKey) {
      return NextResponse.json(
        { error: "The vendor invoice PDF is required" },
        { status: 400 },
      );
    }
    const pdf = await verifyUploadedPdf(
      body.invoicePdfKey,
      "hardware-purchase-invoice",
    );
    if (!pdf.ok) {
      return NextResponse.json({ error: pdf.error }, { status: 400 });
    }

    let sheetKey: string | null = null;
    if (body.invoiceSheetKey) {
      const sheet = await verifyUploadedSheet(
        body.invoiceSheetKey,
        "hardware-purchase-sheet",
      );
      if (!sheet.ok) {
        return NextResponse.json({ error: sheet.error }, { status: 400 });
      }
      sheetKey = sheet.key;
    }

    // Create the hardware purchase invoice. New invoices always start
    // Pending; they become Paid only through the record-payment route.
    const hardwarePurchase = await prisma.hardwarePurchaseInvoice.create({
      data: {
        invoiceNumber: body.invoiceNumber,
        vendorId: vendor.vendorId,
        hardwareDescription: body.hardwareDescription,
        billingDate: new Date(body.billingDate),
        dueDate: new Date(body.dueDate),
        quantity: body.quantity,
        unitPrice: new Decimal(body.unitPrice),
        miscellaneousCharges: new Decimal(body.miscellaneousCharges || 0),
        securityDeposit: new Decimal(securityDeposit),
        totalAmount: new Decimal(body.totalAmount),
        paymentStatus: "Pending",
        notes: body.notes || null,
        invoicePdfKey: pdf.key,
        invoicePdfName: cleanFileName(body.invoicePdfName),
        invoiceSheetKey: sheetKey,
        invoiceSheetName: sheetKey
          ? cleanFileName(body.invoiceSheetName)
          : null,
        createdBy: userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.HARDWARE_PURCHASE_INVOICE_CREATED,
        entityType: "HardwarePurchaseInvoice",
        entityId: hardwarePurchase.id,
        userId,
        description: `Hardware purchase invoice ${hardwarePurchase.invoiceNumber} created`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: hardwarePurchase,
        message: "Hardware purchase invoice created successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating hardware purchase invoice:", error);
    return NextResponse.json(
      { error: "Failed to create hardware purchase invoice" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || !isStaffRole(user.role)) {
      return NextResponse.json(
        { error: "Only administrators can access hardware purchase invoices" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const { where, orderBy } = parseHardwarePurchaseQuery(searchParams);

    const skip = (page - 1) * limit;

    // Stat cards cover the whole filtered set, not just this page. Only
    // Pending invoices are owed; dueDate is stored at UTC midnight, so it's
    // overdue once it falls before today's calendar date in the viewer's tz.
    const tz = resolveExportTimeZone(searchParams.get("tz"));
    const todayStart = utcDayStart(formatIsoDate(new Date(), tz));
    const pendingWhere: Prisma.HardwarePurchaseInvoiceWhereInput = {
      AND: [where, { paymentStatus: "Pending" }],
    };

    const [hardwarePurchases, total, unpaidCount, overdueCount, outstanding] =
      await Promise.all([
        prisma.hardwarePurchaseInvoice.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: { vendor: vendorSelect },
        }),
        prisma.hardwarePurchaseInvoice.count({ where }),
        prisma.hardwarePurchaseInvoice.count({ where: pendingWhere }),
        prisma.hardwarePurchaseInvoice.count({
          where: { AND: [pendingWhere, { dueDate: { lt: todayStart } }] },
        }),
        prisma.hardwarePurchaseInvoice.aggregate({
          where: pendingWhere,
          _sum: { totalAmount: true },
        }),
      ]);

    return NextResponse.json(
      {
        success: true,
        data: hardwarePurchases,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        summary: {
          unpaidCount,
          overdueCount,
          totalOutstanding: Number(outstanding._sum.totalAmount ?? 0),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching hardware purchase invoices:", error);

    const message = error instanceof Error ? error.message : "";
    const isMissingDatabaseObject =
      /does not exist|table .* does not exist|relation .* does not exist|column .* does not exist|unknown column/i.test(
        message,
      );

    if (isMissingDatabaseObject) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          message: "Hardware purchase data is temporarily unavailable",
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch hardware purchase invoices" },
      { status: 500 },
    );
  }
}
