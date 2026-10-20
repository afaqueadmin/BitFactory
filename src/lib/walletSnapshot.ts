import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { generatePDFFromUrl } from "@/lib/email";

/**
 * Server side of the admin "Email wallet snapshot" feature: the PDF is the
 * customer's wallet overview rendered by /wallet-snapshot/[customerId] (the
 * same component as their /wallet page) and printed by Puppeteer.
 */

// Layout width of the /wallet-snapshot page, in CSS px.
const SNAPSHOT_WIDTH = 1200;

/** The caller's id when they're ADMIN/SUPER_ADMIN, else an error response. */
export async function authorizeAdmin(
  request: NextRequest,
): Promise<{ adminId: string } | NextResponse> {
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
  const admin = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { role: true },
  });
  if (admin?.role !== "ADMIN" && admin?.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only administrators can send wallet snapshots" },
      { status: 403 },
    );
  }
  return { adminId: decoded.userId };
}

/** A client or simulated account that a snapshot can be sent to. */
export async function loadSnapshotCustomer(customerId: string) {
  const customer = await prisma.user.findFirst({
    where: {
      id: customerId,
      isDeleted: false,
      role: { in: ["CLIENT", "SIMULATED"] },
    },
    select: { id: true, name: true, email: true, role: true },
  });
  return customer;
}

/** Renders the customer's wallet overview to a PDF as the requesting admin. */
export async function renderWalletSnapshotPdf(
  request: NextRequest,
  customerId: string,
): Promise<Buffer> {
  const token = request.cookies.get("token")?.value ?? "";
  const url = `${request.nextUrl.origin}/wallet-snapshot/${encodeURIComponent(customerId)}`;
  return generatePDFFromUrl(
    url,
    [{ name: "token", value: token }],
    SNAPSHOT_WIDTH,
  );
}

export function walletSnapshotFilename(customerName: string | null): string {
  const slug =
    (customerName || "Customer")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_-]/g, "") || "Customer";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `Wallet_Summary_${slug}_${date}.pdf`;
}
