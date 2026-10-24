import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { secondaryLoginEmails } from "@/lib/auth/loginIdentity";
import { getGroupByUserId } from "@/lib/groupUtils";
import { sendWalletSnapshotEmail } from "@/lib/email";
import {
  defaultWalletSnapshotBody,
  defaultWalletSnapshotSubject,
} from "@/lib/email-templates/wallet-snapshot-email";
import {
  authorizeAdmin,
  loadSnapshotCustomer,
  renderWalletSnapshotPdf,
  walletSnapshotFilename,
} from "@/lib/walletSnapshot";

// Puppeteer loads the customer's wallet (live Luxor calls) before printing.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const invoicesInbox = () =>
  process.env.CC_INVOICES_EMAIL || "invoices@bitfactory.ae";

/** Everyone the snapshot can be copied to, as stored - never client input. */
async function loadCcOptions(customerId: string) {
  const [secondaryEmails, group] = await Promise.all([
    secondaryLoginEmails(customerId),
    getGroupByUserId(customerId),
  ]);
  return {
    secondaryEmails,
    rm: group?.email
      ? { name: group.relationshipManager, email: group.email }
      : null,
    invoicesEmail: invoicesInbox(),
  };
}

/**
 * GET /api/admin/customers/[id]/wallet-email
 *
 * What the compose page needs: the recipient, the CC options and the default
 * subject/body.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const customer = await loadSnapshotCustomer(id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const isSimulated = customer.role === "SIMULATED";
  const displayName = customer.name || "Valued Customer";
  const now = new Date();

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      isSimulated,
    },
    ...(await loadCcOptions(customer.id)),
    defaultSubject: defaultWalletSnapshotSubject(now),
    defaultBody: defaultWalletSnapshotBody(displayName, now, isSimulated),
  });
}

/**
 * POST /api/admin/customers/[id]/wallet-email
 * Body: { subject, body, ccSecondary, ccRm, ccInvoices }
 *
 * Renders the wallet snapshot PDF and emails it to the customer. CC
 * addresses are looked up here from the ticked options.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const customer = await loadSnapshotCustomer(id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const payload = await request.json().catch(() => null);
  const subject =
    typeof payload?.subject === "string" ? payload.subject.trim() : "";
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!subject || subject.length > 200) {
    return NextResponse.json(
      { error: "Subject is required (max 200 characters)" },
      { status: 400 },
    );
  }
  if (!body || body.length > 5000) {
    return NextResponse.json(
      { error: "Email body is required (max 5000 characters)" },
      { status: 400 },
    );
  }

  const options = await loadCcOptions(customer.id);
  const ccEmails = [
    ...(payload?.ccSecondary ? options.secondaryEmails : []),
    ...(payload?.ccRm && options.rm ? [options.rm.email] : []),
    ...(payload?.ccInvoices ? [options.invoicesEmail] : []),
  ].filter((email) => email.toLowerCase() !== customer.email.toLowerCase());

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderWalletSnapshotPdf(customer.id, undefined, {
      customerName: customer.name,
    });
  } catch (error) {
    console.error("[Wallet Snapshot Email] PDF render failed:", error);
    return NextResponse.json(
      { error: "Could not generate the wallet PDF. Please try again." },
      { status: 500 },
    );
  }

  const result = await sendWalletSnapshotEmail({
    email: customer.email,
    ccEmails,
    subject,
    body,
    pdfBuffer,
    pdfFilename: walletSnapshotFilename(customer.name),
  });

  try {
    await prisma.auditLog.create({
      data: {
        action: result.success ? "EMAIL_SENT" : "EMAIL_FAILED",
        entityType: "WalletSnapshot",
        entityId: customer.id,
        userId: auth.adminId,
        description: `Wallet snapshot ${result.success ? "sent" : "failed to send"} to ${customer.email}`,
        changes: JSON.stringify({
          sentTo: customer.email,
          ccEmails: result.ccEmails,
          subject,
        }),
      },
    });
  } catch (auditError) {
    console.warn(
      "[Wallet Snapshot Email] Could not write audit log:",
      auditError,
    );
  }

  if (!result.success) {
    return NextResponse.json(
      { error: "Failed to send the email. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    sentTo: customer.email,
    ccEmails: result.ccEmails,
  });
}
