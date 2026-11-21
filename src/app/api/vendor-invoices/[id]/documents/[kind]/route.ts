import { NextRequest } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
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
  const auth = await authorizeStaff(request, ["farm_tariffs.view"]);
  if ("response" in auth) return auth.response;
  const { id, kind } = await params;
  return openInvoiceDocument("vendor", id, kind);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await authorizeStaff(request, ["farm_tariffs.edit"]);
  if ("response" in auth) return auth.response;
  const { id, kind } = await params;
  return replaceInvoiceDocument(request, auth.userId, "vendor", id, kind);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await authorizeStaff(request, ["farm_tariffs.edit"]);
  if ("response" in auth) return auth.response;
  const { id, kind } = await params;
  return removeInvoiceSheet(auth.userId, "vendor", id, kind);
}
