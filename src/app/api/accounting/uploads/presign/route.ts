import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  MAX_PDF_BYTES,
  PDF_CONTENT_TYPE,
  PDF_PREFIXES,
  PdfPurpose,
  presignPdfUpload,
} from "@/lib/storage/r2";

/**
 * Returns a 5-minute presigned PUT URL for uploading one accounting PDF
 * straight to R2 (avoids Vercel's 4.5 MB request body limit). The record
 * that later points at the key re-verifies the uploaded object.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const body: { purpose?: unknown; contentType?: unknown; size?: unknown } =
      await request.json();

    if (
      typeof body.purpose !== "string" ||
      !Object.hasOwn(PDF_PREFIXES, body.purpose)
    ) {
      return NextResponse.json(
        { error: "Unknown upload purpose" },
        { status: 400 },
      );
    }
    if (body.contentType !== PDF_CONTENT_TYPE) {
      return NextResponse.json(
        { error: "Only PDF files can be uploaded" },
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
    if (body.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: "The PDF is larger than 10 MB" },
        { status: 400 },
      );
    }

    const { uploadUrl, key } = await presignPdfUpload(
      body.purpose as PdfPurpose,
    );
    return NextResponse.json({ success: true, data: { uploadUrl, key } });
  } catch (error) {
    console.error("Error creating PDF upload URL:", error);
    return NextResponse.json(
      { error: "Failed to prepare the upload" },
      { status: 500 },
    );
  }
}
