import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { Decimal } from "@prisma/client/runtime/library";
import {
  VENDOR_NAME_OPTIONS,
  VendorNameValue,
} from "@/lib/hooks/useHardwarePurchases";

const VALID_VENDOR_NAMES = VENDOR_NAME_OPTIONS.map((o) => o.value);

interface CreateHardwarePurchaseRequest {
  invoiceNumber: string;
  vendorName: VendorNameValue;
  hardwareDescription: string;
  billingDate: string;
  dueDate: string;
  quantity: number;
  unitPrice: number;
  miscellaneousCharges: number;
  totalAmount: number;
  notes?: string;
  paymentStatus: "Paid" | "Pending" | "Cancelled";
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

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can create hardware purchase invoices" },
        { status: 403 },
      );
    }

    const body: CreateHardwarePurchaseRequest = await request.json();

    // Validate required fields
    if (
      !body.invoiceNumber ||
      !body.vendorName ||
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

    if (!VALID_VENDOR_NAMES.includes(body.vendorName)) {
      return NextResponse.json(
        {
          error: `vendorName must be one of: ${VALID_VENDOR_NAMES.join(", ")}`,
        },
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

    // Create the hardware purchase invoice
    const hardwarePurchase = await prisma.hardwarePurchaseInvoice.create({
      data: {
        invoiceNumber: body.invoiceNumber,
        vendorName: body.vendorName,
        hardwareDescription: body.hardwareDescription,
        billingDate: new Date(body.billingDate),
        dueDate: new Date(body.dueDate),
        quantity: body.quantity,
        unitPrice: new Decimal(body.unitPrice),
        miscellaneousCharges: new Decimal(body.miscellaneousCharges || 0),
        totalAmount: new Decimal(body.totalAmount),
        paymentStatus: body.paymentStatus || "Pending",
        notes: body.notes || null,
        createdBy: userId,
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

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access hardware purchase invoices" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const paymentStatus = searchParams.get("paymentStatus");
    const sortByParam = searchParams.get("sortBy");
    const sortOrderParam = searchParams.get("sortOrder");

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    const sortableFields = [
      "invoiceNumber",
      "vendorName",
      "totalAmount",
      "paymentStatus",
      "billingDate",
      "paidDate",
      "dueDate",
      "createdAt",
    ];
    const sortBy = sortableFields.includes(sortByParam || "")
      ? (sortByParam as string)
      : "createdAt";
    const sortOrder = sortOrderParam === "asc" ? "asc" : "desc";

    const [hardwarePurchases, total] = await Promise.all([
      prisma.hardwarePurchaseInvoice.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.hardwarePurchaseInvoice.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: hardwarePurchases,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
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
