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

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Every page's footer: document name on the left, page X of Y on the right. */
function snapshotFooterTemplate(customerName: string | null | undefined) {
  const label = ["BitFactory", "Wallet Summary", customerName?.trim()]
    .filter(Boolean)
    .map((part) => escapeHtml(part as string))
    .join(" &middot; ");
  return `
    <div style="width: 100%; padding: 0 0.3in; font-family: Arial, sans-serif; font-size: 8px; color: #8a94a6; display: flex; justify-content: space-between;">
      <span>${label}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  `;
}

/**
 * Renders the customer's wallet overview to a PDF. No one signs in: the
 * headless browser gets a 5-minute wallet snapshot ticket that can only
 * read this customer's wallet. Pass `browser` to reuse one browser across
 * several PDFs (the cron does). `payoutDate` (a UTC day) adds that day's
 * payout transactions (payments and fees) below the overview.
 */
export async function renderWalletSnapshotPdf(
  customerId: string,
  browser?: PdfBrowser,
  options: { customerName?: string | null; payoutDate?: Date } = {},
): Promise<Buffer> {
  const ticket = await signWalletSnapshotTicket(customerId);
  const query = new URLSearchParams();
  if (options.customerName) query.set("name", options.customerName);
  if (options.payoutDate) {
    query.set("payoutDate", options.payoutDate.toISOString().slice(0, 10));
  }
  const search = query.size > 0 ? `?${query}` : "";
  const url = `${snapshotBaseUrl()}/wallet-snapshot/${encodeURIComponent(customerId)}${search}`;
  return generatePDFFromUrl(
    url,
    [{ name: WALLET_SNAPSHOT_TICKET_COOKIE, value: ticket }],
    SNAPSHOT_WIDTH,
    browser,
    snapshotFooterTemplate(options.customerName),
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
