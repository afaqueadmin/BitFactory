import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  cleanFileName,
  deleteObject,
  presignDownload,
  verifyUploadedPdf,
  verifyUploadedSheet,
} from "@/lib/storage/r2";

/**
 * The documents attached to a vendor-side invoice (Hardware Purchases and
 * Farm Tariffs share this): the required invoice PDF, an optional Excel/CSV
 * sheet, and the payment receipt PDF. Backs
 * /api/{hardware-purchases|vendor-invoices}/[id]/documents/[kind]:
 *   GET    invoice | sheet | receipt  -> redirect to a presigned download
 *   PUT    invoice | sheet            -> attach/replace (Pending only)
 *   DELETE sheet                      -> remove (Pending only)
 * The receipt is managed by record-payment and is view-only here.
 */

export type InvoiceType = "hardware" | "vendor";

const CONFIG = {
  hardware: {
    entityType: "HardwarePurchaseInvoice",
    label: "Hardware purchase invoice",
    pdfPurpose: "hardware-purchase-invoice",
    sheetPurpose: "hardware-purchase-sheet",
    updatedAction: AuditAction.HARDWARE_PURCHASE_INVOICE_UPDATED,
  },
  vendor: {
    entityType: "VendorInvoice",
    label: "Vendor invoice",
    pdfPurpose: "vendor-invoice",
    sheetPurpose: "vendor-invoice-sheet",
    updatedAction: AuditAction.VENDOR_INVOICE_UPDATED,
  },
} as const;

const documentSelect = {
  invoiceNumber: true,
  paymentStatus: true,
  invoicePdfKey: true,
  invoicePdfName: true,
  invoiceSheetKey: true,
  invoiceSheetName: true,
  paymentReceiptKey: true,
} as const;

interface DocumentUpdate {
  updatedBy: string;
  invoicePdfKey?: string;
  invoicePdfName?: string | null;
  invoiceSheetKey?: string | null;
  invoiceSheetName?: string | null;
}

const findInvoice = (type: InvoiceType, id: string) =>
  type === "hardware"
    ? prisma.hardwarePurchaseInvoice.findUnique({
        where: { id },
        select: documentSelect,
      })
    : prisma.vendorInvoice.findUnique({
        where: { id },
        select: documentSelect,
      });

const updateInvoice = (type: InvoiceType, id: string, data: DocumentUpdate) =>
  type === "hardware"
    ? prisma.hardwarePurchaseInvoice.update({ where: { id }, data })
    : prisma.vendorInvoice.update({ where: { id }, data });

/** Name a download falls back to when no original filename was stored. */
const fallbackName = (invoiceNumber: string, key: string) =>
  `${invoiceNumber}${key.slice(key.lastIndexOf("."))}`;

/** Deletes a replaced/removed object; the record already moved on. */
async function deleteOldObject(key: string | null) {
  if (!key) return;
  try {
    await deleteObject(key);
  } catch (error) {
    console.error(`Couldn't delete replaced document ${key}:`, error);
  }
}

export async function openInvoiceDocument(
  request: NextRequest,
  type: InvoiceType,
  id: string,
  kind: string,
): Promise<NextResponse> {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    if (kind !== "invoice" && kind !== "sheet" && kind !== "receipt") {
      return NextResponse.json({ error: "Unknown document" }, { status: 404 });
    }

    const invoice = await findInvoice(type, id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (kind === "receipt") {
      if (!invoice.paymentReceiptKey) {
        return NextResponse.json({ error: "No PDF on file" }, { status: 404 });
      }
      return NextResponse.redirect(
        await presignDownload(invoice.paymentReceiptKey),
        302,
      );
    }

    if (kind === "invoice") {
      if (!invoice.invoicePdfKey) {
        return NextResponse.json({ error: "No PDF on file" }, { status: 404 });
      }
      return NextResponse.redirect(
        await presignDownload(invoice.invoicePdfKey, {
          fileName:
            invoice.invoicePdfName ??
            fallbackName(invoice.invoiceNumber, invoice.invoicePdfKey),
        }),
        302,
      );
    }

    if (!invoice.invoiceSheetKey) {
      return NextResponse.json(
        { error: "No spreadsheet on file" },
        { status: 404 },
      );
    }
    return NextResponse.redirect(
      await presignDownload(invoice.invoiceSheetKey, {
        disposition: "attachment",
        fileName:
          invoice.invoiceSheetName ??
          fallbackName(invoice.invoiceNumber, invoice.invoiceSheetKey),
      }),
      302,
    );
  } catch (error) {
    console.error(`Error opening ${CONFIG[type].label} document:`, error);
    return NextResponse.json(
      { error: "Failed to open the document" },
      { status: 500 },
    );
  }
}

export async function replaceInvoiceDocument(
  request: NextRequest,
  type: InvoiceType,
  id: string,
  kind: string,
): Promise<NextResponse> {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const config = CONFIG[type];

    if (kind !== "invoice" && kind !== "sheet") {
      return NextResponse.json({ error: "Unknown document" }, { status: 404 });
    }

    const invoice = await findInvoice(type, id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.paymentStatus !== "Pending") {
      return NextResponse.json(
        {
          error: `Documents can only be changed on Pending invoices (this one is ${invoice.paymentStatus})`,
        },
        { status: 400 },
      );
    }

    const body: { key?: unknown; fileName?: unknown } = await request.json();
    const verified =
      kind === "invoice"
        ? await verifyUploadedPdf(body.key, config.pdfPurpose)
        : await verifyUploadedSheet(body.key, config.sheetPurpose);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 400 });
    }

    const fileName = cleanFileName(body.fileName);
    const oldKey =
      kind === "invoice" ? invoice.invoicePdfKey : invoice.invoiceSheetKey;
    const oldName =
      kind === "invoice" ? invoice.invoicePdfName : invoice.invoiceSheetName;
    if (oldKey === verified.key) {
      return NextResponse.json(
        { error: "That file is already attached" },
        { status: 400 },
      );
    }

    await updateInvoice(type, id, {
      updatedBy: auth.userId,
      ...(kind === "invoice"
        ? { invoicePdfKey: verified.key, invoicePdfName: fileName }
        : { invoiceSheetKey: verified.key, invoiceSheetName: fileName }),
    });

    const what = kind === "invoice" ? "invoice PDF" : "Excel/CSV sheet";
    await prisma.auditLog.create({
      data: {
        action: config.updatedAction,
        entityType: config.entityType,
        entityId: id,
        userId: auth.userId,
        description: `${config.label} ${invoice.invoiceNumber}: ${what} ${oldKey ? "replaced" : "attached"}`,
        changes: JSON.stringify({
          document: kind,
          old: { key: oldKey, fileName: oldName },
          new: { key: verified.key, fileName },
        }),
      },
    });

    await deleteOldObject(oldKey);

    return NextResponse.json({
      success: true,
      data: { key: verified.key, fileName },
    });
  } catch (error) {
    console.error(`Error replacing ${CONFIG[type].label} document:`, error);
    return NextResponse.json(
      { error: "Failed to save the document" },
      { status: 500 },
    );
  }
}

export async function removeInvoiceSheet(
  request: NextRequest,
  type: InvoiceType,
  id: string,
  kind: string,
): Promise<NextResponse> {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const config = CONFIG[type];

    // The invoice PDF is required, so only the sheet can be removed.
    if (kind !== "sheet") {
      return NextResponse.json(
        { error: "Only the Excel/CSV sheet can be removed" },
        { status: 400 },
      );
    }

    const invoice = await findInvoice(type, id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.paymentStatus !== "Pending") {
      return NextResponse.json(
        {
          error: `Documents can only be changed on Pending invoices (this one is ${invoice.paymentStatus})`,
        },
        { status: 400 },
      );
    }
    if (!invoice.invoiceSheetKey) {
      return NextResponse.json(
        { error: "No spreadsheet on file" },
        { status: 404 },
      );
    }

    await updateInvoice(type, id, {
      updatedBy: auth.userId,
      invoiceSheetKey: null,
      invoiceSheetName: null,
    });

    await prisma.auditLog.create({
      data: {
        action: config.updatedAction,
        entityType: config.entityType,
        entityId: id,
        userId: auth.userId,
        description: `${config.label} ${invoice.invoiceNumber}: Excel/CSV sheet removed`,
        changes: JSON.stringify({
          document: "sheet",
          old: {
            key: invoice.invoiceSheetKey,
            fileName: invoice.invoiceSheetName,
          },
          new: null,
        }),
      },
    });

    await deleteOldObject(invoice.invoiceSheetKey);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error removing ${CONFIG[type].label} sheet:`, error);
    return NextResponse.json(
      { error: "Failed to remove the spreadsheet" },
      { status: 500 },
    );
  }
}
