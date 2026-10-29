import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  MAX_PDF_BYTES,
  MAX_SHEET_BYTES,
  PDF_CONTENT_TYPE,
  PDF_PREFIXES,
  PdfPurpose,
  SHEET_PREFIXES,
  SheetPurpose,
  isSheetExtension,
  presignPdfUpload,
  presignSheetUpload,
} from "@/lib/storage/r2";

/**
 * Returns a 5-minute presigned PUT URL for uploading one accounting PDF, or
 * an invoice's Excel/CSV sheet, straight to R2 (avoids Vercel's 4.5 MB
 * request body limit). The record that later points at the key re-verifies
 * the uploaded object.
 *
 * PDF purposes send `contentType: "application/pdf"`; sheet purposes send
 * `extension` (xlsx | xls | csv) and get back the content type to PUT with.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const body: {
      purpose?: unknown;
      contentType?: unknown;
      extension?: unknown;
      size?: unknown;
    } = await request.json();

    const isPdfPurpose =
      typeof body.purpose === "string" &&
      Object.hasOwn(PDF_PREFIXES, body.purpose);
    const isSheetPurpose =
      typeof body.purpose === "string" &&
      Object.hasOwn(SHEET_PREFIXES, body.purpose);

    if (!isPdfPurpose && !isSheetPurpose) {
      return NextResponse.json(
        { error: "Unknown upload purpose" },
        { status: 400 },
      );
    }
    if (isPdfPurpose && body.contentType !== PDF_CONTENT_TYPE) {
      return NextResponse.json(
        { error: "Only PDF files can be uploaded" },
        { status: 400 },
      );
    }
    if (isSheetPurpose && !isSheetExtension(body.extension)) {
      return NextResponse.json(
        { error: "Only .xlsx, .xls or .csv files can be uploaded" },
        { status: 400 },
      );
    }
    if (
      typeof body.size !== "number" ||
      !Number.isFinite(body.size) ||
      body.size <= 0
    ) {
      return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
    }
    if (body.size > (isPdfPurpose ? MAX_PDF_BYTES : MAX_SHEET_BYTES)) {
      return NextResponse.json(
        {
          error: isPdfPurpose
            ? "The PDF is larger than 10 MB"
            : "The spreadsheet is larger than 10 MB",
        },
        { status: 400 },
      );
    }

    if (isSheetPurpose && isSheetExtension(body.extension)) {
      const data = await presignSheetUpload(
        body.purpose as SheetPurpose,
        body.extension,
      );
      return NextResponse.json({ success: true, data });
    }

    const { uploadUrl, key } = await presignPdfUpload(
      body.purpose as PdfPurpose,
    );
    return NextResponse.json({
      success: true,
      data: { uploadUrl, key, contentType: PDF_CONTENT_TYPE },
    });
  } catch (error) {
    console.error("Error creating upload URL:", error);
    return NextResponse.json(
      { error: "Failed to prepare the upload" },
      { status: 500 },
    );
  }
}
