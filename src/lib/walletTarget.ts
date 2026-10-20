import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** The account whose wallet data a request should load. */
export interface WalletTarget {
  userId: string;
  role: string;
}

/**
 * Resolves `?customerId=` for the wallet routes: the caller themselves when
 * absent; otherwise any user for ADMIN/SUPER_ADMIN, or one of their own
 * customers for a FRANCHISEE. The target's own role is returned so a
 * simulated customer viewed by an admin still gets simulated data.
 */
export async function resolveWalletTarget(
  decoded: { userId: string; role: string },
  customerId: string | null,
): Promise<WalletTarget | NextResponse> {
  if (!customerId) return { userId: decoded.userId, role: decoded.role };

  const isAdmin = decoded.role === "ADMIN" || decoded.role === "SUPER_ADMIN";
  if (!isAdmin && decoded.role !== "FRANCHISEE") {
    return NextResponse.json(
      { error: "Only administrators can search by customerId" },
      { status: 403 },
    );
  }

  const target = await prisma.user.findFirst({
    where: isAdmin
      ? { id: customerId }
      : { id: customerId, franchisee: { franchiseeId: decoded.userId } },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { userId: target.id, role: target.role };
}
