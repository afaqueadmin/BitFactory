import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { presignDownload } from "@/lib/storage/r2";

/** Opens a security deposit return's receipt PDF. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeStaff(request, ["security_deposits.view"]);
    if ("response" in auth) return auth.response;
    const { id } = await params;

    const movement = await prisma.vendorDepositMovement.findUnique({
      where: { id },
      select: { receiptKey: true },
    });
    if (!movement?.receiptKey) {
      return NextResponse.json({ error: "No PDF on file" }, { status: 404 });
    }

    return NextResponse.redirect(
      await presignDownload(movement.receiptKey),
      302,
    );
  } catch (error) {
    console.error("Error opening deposit return receipt:", error);
    return NextResponse.json(
      { error: "Failed to open the PDF" },
      { status: 500 },
    );
  }
}
