"use client";

/**
 * Picks a PDF (or, with fileKind="sheet", an Excel/CSV sheet) and uploads it
 * straight to R2: asks /api/accounting/uploads/presign for a short-lived PUT
 * URL, then PUTs the file there. Reports the stored key to the parent, which
 * sends it with the form; the server re-verifies it.
 */

import {
  Alert,
  Box,
  Button,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TableChartIcon from "@mui/icons-material/TableChart";
import CloseIcon from "@mui/icons-material/Close";
import { useRef, useState } from "react";

export type PdfUploadPurpose =
  | "vendor-invoice"
  | "vendor-receipt"
  | "hardware-purchase-invoice"
  | "hardware-purchase-receipt"
  | "vendor-deposit-return-receipt";

export type SheetUploadPurpose =
  "vendor-invoice-sheet" | "hardware-purchase-sheet";

export interface UploadedPdf {
  key: string;
  fileName: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

/** Extensions the server accepts for a sheet (see SHEET_TYPES in r2.ts). */
const SHEET_EXTENSIONS = ["xlsx", "xls", "csv"];

/** Per-kind wording and checks. */
const KINDS = {
  pdf: {
    accept: "application/pdf",
    button: "Choose PDF",
    caption: "PDF only, up to 10 MB",
    wrongType: "Please choose a PDF file",
    tooBig: "The PDF must be 10 MB or smaller",
  },
  sheet: {
    accept: ".xlsx,.xls,.csv",
    button: "Choose Excel / CSV",
    caption: "Excel (.xlsx, .xls) or CSV, up to 10 MB",
    wrongType: "Please choose an .xlsx, .xls or .csv file",
    tooBig: "The spreadsheet must be 10 MB or smaller",
  },
} as const;

function putFile(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () =>
      reject(new Error("Upload failed. Check your connection."));
    xhr.send(file);
  });
}

type PdfUploadFieldProps = {
  label: string;
  value: UploadedPdf | null;
  onChange: (value: UploadedPdf | null) => void;
  /** Lets the parent block submit while an upload is in flight. */
  onUploadingChange?: (uploading: boolean) => void;
  required?: boolean;
  disabled?: boolean;
} & (
  | { fileKind?: "pdf"; purpose: PdfUploadPurpose }
  | { fileKind: "sheet"; purpose: SheetUploadPurpose }
);

export function PdfUploadField({
  label,
  purpose,
  fileKind = "pdf",
  value,
  onChange,
  onUploadingChange,
  required = false,
  disabled = false,
}: PdfUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploading = progress !== null;
  const kind = KINDS[fileKind];

  const setUploading = (percent: number | null) => {
    setProgress(percent);
    onUploadingChange?.(percent !== null);
  };

  const handleFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setError(null);

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const typeOk =
      fileKind === "pdf"
        ? file.type === "application/pdf"
        : SHEET_EXTENSIONS.includes(extension);
    if (!typeOk) {
      setError(kind.wrongType);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(kind.tooBig);
      return;
    }

    setUploading(0);
    try {
      const res = await fetch("/api/accounting/uploads/presign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose,
          ...(fileKind === "pdf" ? { contentType: file.type } : { extension }),
          size: file.size,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(body.error || "Failed to prepare the upload");

      // The signature is bound to the content type the server chose.
      await putFile(
        body.data.uploadUrl,
        file,
        body.data.contentType,
        setProgress,
      );
      onChange({ key: body.data.key, fileName: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  return (
    <Box>
      <Typography
        variant="subtitle2"
        color="textSecondary"
        sx={{ fontWeight: 600, mb: 1 }}
      >
        {label}
        {required && " *"}
      </Typography>

      {value ? (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            p: 1.5,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
          }}
        >
          {fileKind === "pdf" ? (
            <PictureAsPdfIcon color="error" />
          ) : (
            <TableChartIcon color="success" />
          )}
          <Typography variant="body2" sx={{ flex: 1, wordBreak: "break-all" }}>
            {value.fileName}
          </Typography>
          <Tooltip title="Remove">
            <span>
              <IconButton
                size="small"
                onClick={() => onChange(null)}
                disabled={disabled}
                aria-label={`Remove ${label}`}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      ) : (
        <Button
          variant="outlined"
          component="label"
          startIcon={<UploadFileIcon />}
          disabled={disabled || uploading}
        >
          {uploading ? "Uploading..." : kind.button}
          <input
            ref={inputRef}
            type="file"
            accept={kind.accept}
            hidden
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </Button>
      )}

      {uploading && (
        <LinearProgress
          variant="determinate"
          value={progress ?? 0}
          sx={{ mt: 1 }}
        />
      )}
      <Typography
        variant="caption"
        color="textSecondary"
        sx={{ display: "block", mt: 0.5 }}
      >
        {kind.caption}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
