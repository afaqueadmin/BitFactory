import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { BILLED_CUSTOMER_ROLES } from "@/lib/customerRoles";
import { REPAIR_MINER_SELECT } from "@/lib/accounting/hardwareRepair";

/**
 * GET /api/accounting/repair-miners[?customerId=...]
 *
 * Miners that can go on a Hardware Repair invoice for this customer: every
 * non-deleted miner they own, whatever its status (a miner in for repair is
 * often not AUTO), with the details shown on the invoice.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, [
      "invoicing.view",
      "invoicing.create",
      "invoicing.edit",
    ]);
    if ("response" in auth) return auth.response;

    // Without customerId: every miner that can be invoiced, with its owner -
    // the create form picks the miner first and fills in the customer. Same
    // customers as /api/accounting/customers?scope=withMiners.
    const customerId = new URL(request.url).searchParams.get("customerId");

    const miners = await prisma.miner.findMany({
      where: customerId
        ? { userId: customerId, isDeleted: false }
        : {
            isDeleted: false,
            user: { role: { in: BILLED_CUSTOMER_ROLES }, isDeleted: false },
          },
      select: {
        ...REPAIR_MINER_SELECT,
        status: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ miners });
  } catch (error) {
    console.error("Failed to fetch repair miners:", error);
    return NextResponse.json(
      { error: "Failed to fetch miners" },
      { status: 500 },
    );
  }
}
