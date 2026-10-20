import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken, verifyWalletSnapshotTicket } from "@/lib/jwt";

/** The account whose wallet data a request should load. */
export interface WalletTarget {
  userId: string;
  role: string;
}

/**
 * Cookie carrying a wallet snapshot ticket (signWalletSnapshotTicket). Set
 * only by the server's headless PDF renderer, never by a browser login.
 */
export const WALLET_SNAPSHOT_TICKET_COOKIE = "wallet_snapshot_ticket";

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

/**
 * Authenticates a wallet overview request (earnings summary, 24h revenue,
 * settings, profit & loss) and resolves whose data it loads.
 *
 * A signed-in session goes through resolveWalletTarget. Without one, a
 * wallet snapshot ticket is accepted instead - but only for the customer it
 * was minted for, named again in `?customerId=`. That is how the headless
 * PDF renderer reads a customer's wallet without anyone being signed in.
 */
export async function authenticateWalletRequest(
  request: NextRequest,
): Promise<WalletTarget | NextResponse> {
  const customerId = request.nextUrl.searchParams.get("customerId");

  const token = request.cookies.get("token")?.value;
  if (token) {
    try {
      const decoded = await verifyJwtToken(token);
      return resolveWalletTarget(decoded, customerId);
    } catch {
      // Fall through: an expired session doesn't block a valid ticket.
    }
  }

  const ticket = request.cookies.get(WALLET_SNAPSHOT_TICKET_COOKIE)?.value;
  if (ticket) {
    let ticketCustomerId: string;
    try {
      ticketCustomerId = await verifyWalletSnapshotTicket(ticket);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!customerId || customerId !== ticketCustomerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const target = await prisma.user.findFirst({
      where: { id: ticketCustomerId, isDeleted: false },
      select: { id: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return { userId: target.id, role: target.role };
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
