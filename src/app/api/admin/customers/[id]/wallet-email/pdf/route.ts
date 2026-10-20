import { NextRequest, NextResponse } from "next/server";
import {
  authorizeAdmin,
  loadSnapshotCustomer,
  renderWalletSnapshotPdf,
  walletSnapshotFilename,
} from "@/lib/walletSnapshot";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/customers/[id]/wallet-email/pdf
 *
 * The exact PDF the wallet snapshot email attaches, shown inline so the admin
 * can check it before sending.
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

  try {
    const pdf = await renderWalletSnapshotPdf(request, customer.id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${walletSnapshotFilename(customer.name)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Wallet Snapshot PDF] Render failed:", error);
    return NextResponse.json(
      { error: "Could not generate the wallet PDF" },
      { status: 500 },
    );
  }
}
