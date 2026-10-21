import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signWalletSnapshotTicket, verifyJwtToken } from "@/lib/jwt";
import { generatePDFFromUrl, type PdfBrowser } from "@/lib/email";
import { appBaseUrl } from "@/lib/auth/passwordReset";
import { WALLET_SNAPSHOT_TICKET_COOKIE } from "@/lib/walletTarget";

/**
 * Server side of the wallet snapshot emails (the admin's manual send and
 * cron_wallet_payment_email): the PDF is the customer's wallet overview
 * rendered by /wallet-snapshot/[customerId] (the same component as their
 * /wallet page) and printed by Puppeteer.
 */

// Layout width of the /wallet-snapshot page, in CSS px.
const SNAPSHOT_WIDTH = 1200;

/**
 * The caller's id when they're ADMIN/SUPER_ADMIN/ACCOUNTING, else an error
 * response.
 */
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
  if (!admin || !isStaffRole(admin.role)) {
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

/**
 * Where the headless browser loads the snapshot page from. Never built from
 * the request's Host header: the browser carries a ticket for the
 * customer's data, and a forged Host would hand it to someone else's site.
 */
function snapshotBaseUrl(): string {
  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:${process.env.PORT || 3000}`;
  }
  return appBaseUrl();
}

/**
 * Renders the customer's wallet overview to a PDF. No one signs in: the
 * headless browser gets a 5-minute wallet snapshot ticket that can only
 * read this customer's wallet overview. Pass `browser` to reuse one browser
 * across several PDFs (the cron does).
 */
export async function renderWalletSnapshotPdf(
  customerId: string,
  browser?: PdfBrowser,
): Promise<Buffer> {
  const ticket = await signWalletSnapshotTicket(customerId);
  const url = `${snapshotBaseUrl()}/wallet-snapshot/${encodeURIComponent(customerId)}`;
  return generatePDFFromUrl(
    url,
    [{ name: WALLET_SNAPSHOT_TICKET_COOKIE, value: ticket }],
    SNAPSHOT_WIDTH,
    browser,
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
