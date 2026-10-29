import { NextRequest } from "next/server";
import {
  openInvoiceDocument,
  removeInvoiceSheet,
  replaceInvoiceDocument,
} from "@/lib/accounting/invoiceDocuments";

/**
 * Farm Tariff (vendor) invoice documents: kind = invoice | sheet | receipt.
 * GET opens one; PUT attaches/replaces the invoice PDF or sheet; DELETE
 * removes the sheet. Changes are allowed on Pending invoices only.
 */
type Params = { params: Promise<{ id: string; kind: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  return openInvoiceDocument(request, "vendor", id, kind);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  return replaceInvoiceDocument(request, "vendor", id, kind);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  return removeInvoiceSheet(request, "vendor", id, kind);
}
