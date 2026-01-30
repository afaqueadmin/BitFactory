import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { generatePDFFromHTML } from "@/lib/email";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const renderStatementTemplate = (
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

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jwtPayload = await verifyJwtToken(token);
    const userId = jwtPayload.userId;

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "Start date and end date are required" },
        { status: 400 },
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Set end date to end of day
    end.setHours(23, 59, 59, 999);

    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 },
      );
    }

    if (start > end) {
      return NextResponse.json(
        { error: "Start date must be before end date" },
        { status: 400 },
      );
    }

    // Check 12-month limit
    const monthsDiff =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());

    if (monthsDiff > 12) {
      return NextResponse.json(
        { error: "Date range cannot exceed 12 months" },
        { status: 400 },
      );
    }

    // Fetch user details
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

    // Fetch ALL cost payments for the user (to calculate correct running balance)
    const allPayments = await prisma.costPayment.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Calculate running balance for all payments
    const balanceMap = new Map<string, number>();
    let runningBalance = 0;

    for (const payment of allPayments) {
      if (payment.type === "PAYMENT") {
        runningBalance += Number(payment.amount);
      } else if (payment.type === "ELECTRICITY_CHARGES") {
        runningBalance += Number(payment.amount);
      } else if (payment.type === "ADJUSTMENT") {
        runningBalance += Number(payment.amount);
      }
      balanceMap.set(payment.id, runningBalance);
    }

    // Fetch cost payments for the user within the date range
    const costPayments = await prisma.costPayment.findMany({
      where: {
        userId: userId,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Calculate totals and get balance from balanceMap
    const paymentsWithBalance = costPayments.map((payment) => {
      const balance = balanceMap.get(payment.id) ?? 0;
      return {
        ...payment,
        runningBalance: balance,
      };
    });

    const totalAmount = costPayments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const totalConsumption = costPayments.reduce(
      (sum, payment) => sum + Number(payment.consumption),
      0,
    );

    // Load PDF template
    const templatePath = join(
      process.cwd(),
      "src/lib/email-templates/statement.html",
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

    // Build transaction rows HTML
    const transactionRows = paymentsWithBalance
      .map((payment) => {
        // Format type to match API output
        const formattedType =
          payment.type === "PAYMENT"
            ? "Payment"
            : payment.type === "ELECTRICITY_CHARGES"
              ? "Electricity Charges"
              : payment.type === "ADJUSTMENT"
                ? "Adjustment"
                : payment.type;

        // Format amount with sign
        const amountSign =
          payment.type === "PAYMENT" || payment.type === "ADJUSTMENT"
            ? payment.amount >= 0
              ? "+ "
              : "- "
            : "- ";
        const formattedAmount =
          amountSign + Math.abs(Number(payment.amount)).toFixed(2);

        // Format balance with sign
        const balanceSign = payment.runningBalance >= 0 ? "+ " : "- ";
        const formattedBalance =
          balanceSign + Math.abs(payment.runningBalance).toFixed(2);

        // Format consumption
        const formattedConsumption =
          Number(payment.consumption) > 0
            ? `${Number(payment.consumption).toFixed(2)} kWh`
            : "N/A";

        return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formatDateShort(new Date(payment.createdAt))}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formattedType}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formattedConsumption}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${formattedAmount}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${formattedBalance}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; font-size: 12px; color: #666;">${payment.narration || "-"}</td>
      </tr>
    `;
      })
      .join("");

    const statementData = {
      customerName: user.name || "Valued Customer",
      customerEmail: user.email || "",
      startDate: formatDate(start),
      endDate: formatDate(end),
      generatedDate: formatDate(new Date()),
      totalTransactions: costPayments.length.toString(),
      totalAmount: `$${totalAmount.toFixed(2)}`,
      totalConsumption: Number(totalConsumption).toFixed(2),
      transactionRows:
        transactionRows ||
        "<tr><td colspan='6' style='padding: 20px; text-align: center; color: #666;'>No transactions found for this period</td></tr>",
    };

    const htmlContent = renderStatementTemplate(template, statementData);
    const pdfBuffer = await generatePDFFromHTML(htmlContent);

    // Return PDF as file download
    return new NextResponse(pdfBuffer as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="account-statement-${start.toISOString().split("T")[0]}-to-${end.toISOString().split("T")[0]}.pdf"`,
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
