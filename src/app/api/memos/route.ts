import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { generateMemoPDF, sendMemoEmail } from "@/lib/email";
import { AuditAction, Prisma } from "@prisma/client";

/**
 * List (GET) and create (POST) memos across both the Hosting & Colocation
 * and Hardware Sales modules. A memo can be linked to a specific invoice or
 * stand alone against a customer, and is either CUSTOMER_FACING (PDF
 * generated + emailed, labeled "Debit Memo"/"Credit Memo" to the customer
 * based on the amount's sign) or INTERNAL (ledger-only, no PDF/email).
 *
 * GET is also reachable by the CLIENT who owns the memos: their request is
 * force-scoped to their own userId and CUSTOMER_FACING memos only,
 * regardless of any customerId/memoType filters they pass.
 */

const SORT_FIELDS = new Set(["createdAt", "amount", "memoNumber"]);

function buildOrderBy(
  sortBy: string,
  sortOrder: "asc" | "desc",
): Prisma.MemoOrderByWithRelationInput {
  switch (sortBy) {
    case "amount":
      return { amount: sortOrder };
    case "memoNumber":
      return { memoNumber: sortOrder };
    case "createdAt":
    default:
      return { createdAt: sortOrder };
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      console.error("[Memos] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
    const isClient = userRole === "CLIENT";

    if (!isAdmin && !isClient) {
      return NextResponse.json(
        {
          error:
            "Only administrators or the account owner can access this data",
        },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "0", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "25", 10);

    if (page < 0 || pageSize < 1 || pageSize > 9999) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400 },
      );
    }

    const sortByParam = url.searchParams.get("sortBy") || "createdAt";
    const sortOrderParam = url.searchParams.get("sortOrder");
    const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
    const sortBy = SORT_FIELDS.has(sortByParam) ? sortByParam : "createdAt";

    const customerIdParam = url.searchParams.get("customerId")?.trim();
    const categoryParam = url.searchParams.get("category");
    const memoTypeParam = url.searchParams.get("memoType");
    const statusParam = url.searchParams.get("status");
    const invoiceIdParam = url.searchParams.get("invoiceId")?.trim();
    const startDateParam = url.searchParams.get("startDate");
    const endDateParam = url.searchParams.get("endDate");

    let startDate: Date | null = null;
    if (startDateParam) {
      const parsed = new Date(startDateParam);
      if (!isNaN(parsed.getTime())) {
        startDate = parsed;
      }
    }

    let endDate: Date | null = null;
    if (endDateParam) {
      const parsed = new Date(endDateParam);
      if (!isNaN(parsed.getTime())) {
        parsed.setHours(23, 59, 59, 999);
        endDate = parsed;
      }
    }

    const where: Prisma.MemoWhereInput = {
      user: { isDeleted: false },
      // CLIENT requests are always self-scoped to their own customer-facing
      // memos, ignoring any customerId/memoType they might pass - admins
      // get the full filter set.
      ...(isClient
        ? { userId, memoType: "CUSTOMER_FACING" as const }
        : {
            ...(customerIdParam ? { userId: customerIdParam } : {}),
            ...(memoTypeParam === "CUSTOMER_FACING" ||
            memoTypeParam === "INTERNAL"
              ? { memoType: memoTypeParam }
              : {}),
          }),
      ...(invoiceIdParam ? { invoiceId: invoiceIdParam } : {}),
      ...(categoryParam === "HOSTING" || categoryParam === "HARDWARE"
        ? { category: categoryParam }
        : {}),
      ...(statusParam === "ISSUED" || statusParam === "VOIDED"
        ? { status: statusParam }
        : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const [totalCount, sumResult, memos] = await Promise.all([
      prisma.memo.count({ where }),
      prisma.memo.aggregate({
        where: { ...where, status: "ISSUED" },
        _sum: { amount: true },
      }),
      prisma.memo.findMany({
        where,
        orderBy: buildOrderBy(sortBy, sortOrder),
        skip: page * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true, email: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalAmount: Number((sumResult._sum.amount || 0).toFixed(2)),
        },
        memos,
      },
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    console.error("[Memos] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch memos" },
      { status: 500 },
    );
  }
}

// Maps a memo category to the invoice type it's expected to line up with,
// when the memo is linked to a specific invoice.
const CATEGORY_TO_INVOICE_TYPE: Record<string, string> = {
  HOSTING: "ELECTRICITY_CHARGES",
  HARDWARE: "HARDWARE_SALES",
};

const OPPOSITE_CATEGORY: Record<
  "HOSTING" | "HARDWARE",
  "HOSTING" | "HARDWARE"
> = {
  HOSTING: "HARDWARE",
  HARDWARE: "HOSTING",
};

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let adminUserId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      adminUserId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      console.error("[Memos] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can create memos" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      userId: bodyUserId,
      invoiceId,
      category,
      memoType,
      amount,
      reason,
      transfer,
    } = body as {
      userId?: string;
      invoiceId?: string;
      category?: string;
      memoType?: string;
      amount?: number;
      reason?: string;
      transfer?: boolean;
    };

    if (category !== "HOSTING" && category !== "HARDWARE") {
      return NextResponse.json(
        { error: "category must be HOSTING or HARDWARE" },
        { status: 400 },
      );
    }

    if (memoType !== "CUSTOMER_FACING" && memoType !== "INTERNAL") {
      return NextResponse.json(
        { error: "memoType must be CUSTOMER_FACING or INTERNAL" },
        { status: 400 },
      );
    }

    if (transfer === true && memoType !== "INTERNAL") {
      return NextResponse.json(
        { error: "transfer is only supported for memoType INTERNAL" },
        { status: 400 },
      );
    }

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount === 0
    ) {
      return NextResponse.json(
        { error: "Amount must be a non-zero number" },
        { status: 400 },
      );
    }

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "Reason is required" },
        { status: 400 },
      );
    }

    if (reason.length > 500) {
      return NextResponse.json(
        { error: "Reason must not exceed 500 characters" },
        { status: 400 },
      );
    }

    // Resolve the target customer: either from the linked invoice, or
    // directly from the request body for a standalone memo.
    let targetUserId: string;
    let linkedInvoice: {
      id: string;
      invoiceNumber: string;
      invoiceType: string;
    } | null = null;

    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          userId: true,
          invoiceNumber: true,
          invoiceType: true,
        },
      });

      if (!invoice) {
        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 },
        );
      }

      if (invoice.invoiceType !== CATEGORY_TO_INVOICE_TYPE[category]) {
        return NextResponse.json(
          {
            error: `Invoice type ${invoice.invoiceType} does not match category ${category}`,
          },
          { status: 400 },
        );
      }

      targetUserId = invoice.userId;
      linkedInvoice = invoice;
    } else {
      if (!bodyUserId || typeof bodyUserId !== "string") {
        return NextResponse.json(
          { error: "userId is required when no invoiceId is provided" },
          { status: 400 },
        );
      }
      targetUserId = bodyUserId;
    }

    const customer = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        email: true,
        luxorSubaccountName: true,
        poolAuths: {
          where: { pool: { name: "Luxor" } },
          select: { authKey: true },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    const luxorIdentifier =
      customer.poolAuths[0]?.authKey || customer.luxorSubaccountName;

    if (!luxorIdentifier) {
      return NextResponse.json(
        { error: "Customer does not have a Luxor subaccount name" },
        { status: 400 },
      );
    }

    const isTransfer = transfer === true;

    // Generate memo number(s): MEMO-luxorIdentifier-YYYYMMDD-sequence. A
    // transfer consumes two consecutive sequence numbers for this customer.
    const timestamp = new Date();
    const dateStr = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}`;

    const customerLastMemo = await prisma.memo.findFirst({
      where: { userId: targetUserId },
      select: { memoNumber: true },
      orderBy: { createdAt: "desc" },
    });

    const lastSeq = customerLastMemo
      ? parseInt(customerLastMemo.memoNumber.split("-").pop() || "0", 10) || 0
      : 0;
    const primaryMemoNumber = `MEMO-${luxorIdentifier}-${dateStr}-${String(lastSeq + 1).padStart(3, "0")}`;
    const pairedMemoNumber = isTransfer
      ? `MEMO-${luxorIdentifier}-${dateStr}-${String(lastSeq + 2).padStart(3, "0")}`
      : null;

    const { memo, pairedMemo } = await prisma.$transaction(async (tx) => {
      let memo = await tx.memo.create({
        data: {
          memoNumber: primaryMemoNumber,
          userId: targetUserId,
          invoiceId: linkedInvoice?.id,
          category: category as "HOSTING" | "HARDWARE",
          memoType: memoType as "CUSTOMER_FACING" | "INTERNAL",
          amount,
          reason: reason.trim(),
          createdBy: adminUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.MEMO_CREATED,
          entityType: "Memo",
          entityId: memo.id,
          userId: adminUserId,
          description: `Memo ${primaryMemoNumber} created for ${customer.name || customer.email} (${category}, ${memoType})`,
          changes: JSON.stringify({
            amount,
            category,
            memoType,
            reason: reason.trim(),
            invoiceId: linkedInvoice?.id || null,
            invoiceNumber: linkedInvoice?.invoiceNumber || null,
          }),
        },
      });

      // Customer-facing memos actually move the customer's balance
      // (statement, wallet, dashboard balance card), which are all computed
      // from CostPayment rows - so mirror the memo as a linked ADJUSTMENT
      // payment. Internal memos stay a revenue-reporting-only correction.
      if (memoType === "CUSTOMER_FACING") {
        await tx.costPayment.create({
          data: {
            userId: targetUserId,
            invoiceId: linkedInvoice?.id,
            memoId: memo.id,
            amount,
            consumption: 0,
            type: "ADJUSTMENT",
            narration: `Memo ${primaryMemoNumber}: ${reason.trim()}`.slice(
              0,
              500,
            ),
          },
        });
      }

      let pairedMemo = null;
      if (isTransfer) {
        const oppositeCategory =
          OPPOSITE_CATEGORY[category as "HOSTING" | "HARDWARE"];
        pairedMemo = await tx.memo.create({
          data: {
            memoNumber: pairedMemoNumber!,
            userId: targetUserId,
            invoiceId: null,
            category: oppositeCategory,
            memoType: "INTERNAL",
            amount: -amount,
            reason: reason.trim(),
            createdBy: adminUserId,
            pairedMemoId: memo.id,
          },
        });

        memo = await tx.memo.update({
          where: { id: memo.id },
          data: { pairedMemoId: pairedMemo.id },
        });

        await tx.auditLog.create({
          data: {
            action: AuditAction.MEMO_CREATED,
            entityType: "Memo",
            entityId: pairedMemo.id,
            userId: adminUserId,
            description: `Memo ${pairedMemoNumber} created for ${customer.name || customer.email} (${oppositeCategory}, INTERNAL) - paired transfer offset of ${primaryMemoNumber}`,
            changes: JSON.stringify({
              amount: -amount,
              category: oppositeCategory,
              memoType: "INTERNAL",
              reason: reason.trim(),
              pairedMemoId: memo.id,
              pairedMemoNumber: primaryMemoNumber,
            }),
          },
        });
      }

      return { memo, pairedMemo };
    });

    let emailWarning: string | null = null;

    if (memoType === "CUSTOMER_FACING") {
      if (!customer.email) {
        emailWarning =
          "Memo created, but the customer has no email on file so no notice was sent.";
      } else {
        try {
          const pdfBuffer = await generateMemoPDF({
            memoNumber: primaryMemoNumber,
            customerName: customer.name || "Valued Customer",
            customerEmail: customer.email,
            category: category as "HOSTING" | "HARDWARE",
            amount,
            reason: reason.trim(),
            issuedDate: memo.issuedDate,
            invoiceNumber: linkedInvoice?.invoiceNumber || null,
          });

          const sendResult = await sendMemoEmail(
            customer.email,
            customer.name || "Valued Customer",
            primaryMemoNumber,
            amount,
            reason.trim(),
            pdfBuffer,
            linkedInvoice?.invoiceNumber || null,
          );

          if (!sendResult.success) {
            throw sendResult.error || new Error("Unknown email failure");
          }

          await prisma.auditLog.create({
            data: {
              action: AuditAction.MEMO_SENT,
              entityType: "Memo",
              entityId: memo.id,
              userId: adminUserId,
              description: `Memo ${primaryMemoNumber} emailed to ${customer.email}`,
            },
          });
        } catch (emailError) {
          console.error(
            `Failed to generate/send memo email for ${primaryMemoNumber}:`,
            emailError,
          );
          emailWarning =
            "Memo created, but the PDF/email could not be sent. You can retry from the memo list.";
        }
      }
    }

    return NextResponse.json({
      success: true,
      memo,
      pairedMemo,
      emailWarning,
    });
  } catch (error) {
    console.error("[Memos] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create memo" },
      { status: 500 },
    );
  }
}
