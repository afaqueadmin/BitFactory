import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

/**
 * Cloudflare R2 (S3-compatible) storage for accounting PDFs and the
 * optional Excel/CSV sheets that go with vendor invoices. The bucket is
 * private: the browser uploads with a short-lived presigned PUT, and
 * downloads go through admin-only routes that redirect to a presigned GET.
 *
 * Env: ACCESS_KEY_ID, SECRET_ACCESS_KEY, S3_API_ENDPOINT (account endpoint,
 * no bucket path) and BUCKET_NAME. Path-style URLs keep every request on the
 * S3_API_ENDPOINT host, which is the origin next.config.ts allows in CSP.
 */

export const PDF_CONTENT_TYPE = "application/pdf";
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const URL_TTL_SECONDS = 5 * 60;

/** Key prefixes, one per kind of document. */
export const PDF_PREFIXES = {
  "vendor-invoice": "vendor-invoices/",
  "vendor-receipt": "vendor-receipts/",
  "hardware-purchase-invoice": "hardware-purchases/",
  "hardware-purchase-receipt": "hardware-purchase-receipts/",
  "vendor-deposit-return-receipt": "vendor-deposit-return-receipts/",
} as const;

export type PdfPurpose = keyof typeof PDF_PREFIXES;

/** Key prefixes for the Excel/CSV sheets attached to vendor invoices. */
export const SHEET_PREFIXES = {
  "hardware-purchase-sheet": "hardware-purchase-sheets/",
  "vendor-invoice-sheet": "vendor-invoice-sheets/",
} as const;

export type SheetPurpose = keyof typeof SHEET_PREFIXES;

/**
 * Accepted sheet extensions and the content type each is stored with.
 * Browsers report CSV/XLS types inconsistently (a CSV is often
 * "application/vnd.ms-excel" on Windows, or empty), so the client sends the
 * extension and the server picks the type.
 */
export const SHEET_TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
} as const;

export type SheetExtension = keyof typeof SHEET_TYPES;
export const MAX_SHEET_BYTES = 10 * 1024 * 1024;

export const isSheetExtension = (ext: unknown): ext is SheetExtension =>
  typeof ext === "string" && Object.hasOwn(SHEET_TYPES, ext);

let client: S3Client | null = null;

function config() {
  const { ACCESS_KEY_ID, SECRET_ACCESS_KEY, S3_API_ENDPOINT, BUCKET_NAME } =
    process.env;
  if (
    !ACCESS_KEY_ID ||
    !SECRET_ACCESS_KEY ||
    !S3_API_ENDPOINT ||
    !BUCKET_NAME
  ) {
    throw new Error(
      "R2 storage is not configured (ACCESS_KEY_ID, SECRET_ACCESS_KEY, S3_API_ENDPOINT, BUCKET_NAME)",
    );
  }
  return {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    endpoint: S3_API_ENDPOINT,
    bucket: BUCKET_NAME,
  };
}

function s3(): { client: S3Client; bucket: string } {
  const { accessKeyId, secretAccessKey, endpoint, bucket } = config();
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return { client, bucket };
}

/**
 * Presigned PUT for a new PDF under the purpose's prefix. The signature is
 * bound to the PDF content type, so the browser must send that header.
 */
export async function presignPdfUpload(
  purpose: PdfPurpose,
): Promise<{ uploadUrl: string; key: string }> {
  const { client, bucket } = s3();
  const key = `${PDF_PREFIXES[purpose]}${randomUUID()}.pdf`;
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: PDF_CONTENT_TYPE,
    }),
    // Sign Content-Type so R2 rejects a PUT with any other type.
    { expiresIn: URL_TTL_SECONDS, signableHeaders: new Set(["content-type"]) },
  );
  return { uploadUrl, key };
}

/** Presigned PUT for a new Excel/CSV sheet; same content-type binding. */
export async function presignSheetUpload(
  purpose: SheetPurpose,
  extension: SheetExtension,
): Promise<{ uploadUrl: string; key: string; contentType: string }> {
  const { client, bucket } = s3();
  const key = `${SHEET_PREFIXES[purpose]}${randomUUID()}.${extension}`;
  const contentType = SHEET_TYPES[extension];
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: URL_TTL_SECONDS, signableHeaders: new Set(["content-type"]) },
  );
  return { uploadUrl, key, contentType };
}

/**
 * Confirms an uploaded object is a real PDF before a record points at it:
 * the key has the expected prefix, the object exists, is at most 10 MB, has
 * the PDF content type, and its first bytes are the "%PDF-" signature.
 */
export async function verifyUploadedPdf(
  key: unknown,
  purpose: PdfPurpose,
): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const prefix = PDF_PREFIXES[purpose];
  if (
    typeof key !== "string" ||
    !key.startsWith(prefix) ||
    !/^[a-z-]+\/[0-9a-f-]{36}\.pdf$/.test(key)
  ) {
    return { ok: false, error: "Invalid PDF upload reference" };
  }

  const { client, bucket } = s3();
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    if ((head.ContentLength ?? 0) > MAX_PDF_BYTES) {
      return { ok: false, error: "The PDF is larger than 10 MB" };
    }
    if (head.ContentType !== PDF_CONTENT_TYPE) {
      return { ok: false, error: "The uploaded file is not a PDF" };
    }

    const start = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-4" }),
    );
    const bytes = await start.Body?.transformToString("latin1");
    if (bytes !== "%PDF-") {
      return { ok: false, error: "The uploaded file is not a valid PDF" };
    }
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") {
      return {
        ok: false,
        error: "The PDF upload was not found. Please upload it again.",
      };
    }
    throw error;
  }

  return { ok: true, key };
}

/**
 * Confirms an uploaded object is a real sheet of the type its key names:
 * expected prefix, exists, at most 10 MB, stored with that extension's
 * content type, and its first bytes match the format - the ZIP signature
 * for .xlsx, the OLE2 signature for .xls, and no NUL bytes for .csv (plain
 * text has no signature, so that is the most that can be checked).
 */
export async function verifyUploadedSheet(
  key: unknown,
  purpose: SheetPurpose,
): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const prefix = SHEET_PREFIXES[purpose];
  const match =
    typeof key === "string"
      ? /^[a-z-]+\/[0-9a-f-]{36}\.(xlsx|xls|csv)$/.exec(key)
      : null;
  if (typeof key !== "string" || !key.startsWith(prefix) || !match) {
    return { ok: false, error: "Invalid spreadsheet upload reference" };
  }
  const extension = match[1] as SheetExtension;

  const { client, bucket } = s3();
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    if ((head.ContentLength ?? 0) > MAX_SHEET_BYTES) {
      return { ok: false, error: "The spreadsheet is larger than 10 MB" };
    }
    if (head.ContentType !== SHEET_TYPES[extension]) {
      return { ok: false, error: "The uploaded file is not a spreadsheet" };
    }

    const start = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-511" }),
    );
    const bytes = Buffer.from((await start.Body?.transformToByteArray()) ?? []);
    const valid =
      extension === "xlsx"
        ? bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
        : extension === "xls"
          ? bytes.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
          : bytes.length > 0 && !bytes.includes(0);
    if (!valid) {
      return {
        ok: false,
        error: `The uploaded file is not a valid .${extension} file`,
      };
    }
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") {
      return {
        ok: false,
        error: "The spreadsheet upload was not found. Please upload it again.",
      };
    }
    throw error;
  }

  return { ok: true, key };
}

/** Content type a stored key was uploaded with, from its extension. */
export const contentTypeForKey = (key: string): string => {
  const ext = key.slice(key.lastIndexOf(".") + 1);
  return isSheetExtension(ext) ? SHEET_TYPES[ext] : PDF_CONTENT_TYPE;
};

/**
 * Original filename as sent by the browser, stored for display/downloads:
 * path segments and control characters dropped, capped at 255 characters
 * (trimming the name, not the extension). Null when nothing usable was sent.
 */
export const cleanFileName = (name: unknown): string | null => {
  if (typeof name !== "string") return null;
  const base = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
  if (base.length <= 255) return base || null;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 10 ? base.slice(dot) : "";
  return base.slice(0, 255 - ext.length) + ext;
};

/**
 * Content-Disposition value with the original filename: a plain ASCII
 * fallback plus an RFC 5987 UTF-8 copy so non-Latin names survive.
 */
const contentDisposition = (
  disposition: "inline" | "attachment",
  fileName?: string,
): string => {
  if (!fileName) return disposition;
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

/**
 * Short-lived presigned GET for a stored document. PDFs open inline by
 * default; pass "attachment" (sheets) to download, and fileName to keep the
 * original name.
 */
export async function presignDownload(
  key: string,
  options: { disposition?: "inline" | "attachment"; fileName?: string } = {},
): Promise<string> {
  const { client, bucket } = s3();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: contentTypeForKey(key),
      ResponseContentDisposition: contentDisposition(
        options.disposition ?? "inline",
        options.fileName,
      ),
    }),
    { expiresIn: URL_TTL_SECONDS },
  );
}

/** Deletes a stored PDF. Deleting a key that's already gone succeeds. */
export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = s3();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
