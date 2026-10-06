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
 * Cloudflare R2 (S3-compatible) storage for accounting PDFs. The bucket is
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
} as const;

export type PdfPurpose = keyof typeof PDF_PREFIXES;

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

/** Short-lived presigned GET for viewing a stored PDF in the browser. */
export async function presignDownload(key: string): Promise<string> {
  const { client, bucket } = s3();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: PDF_CONTENT_TYPE,
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: URL_TTL_SECONDS },
  );
}

/** Deletes a stored PDF. Deleting a key that's already gone succeeds. */
export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = s3();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
