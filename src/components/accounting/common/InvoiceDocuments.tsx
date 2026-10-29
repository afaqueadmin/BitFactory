"use client";

/**
 * The invoice PDF and optional Excel/CSV sheet on a vendor-side invoice's
 * detail page (Hardware Purchases and Farm Tariffs). Renders two grid cells
 * so it drops into the page's existing details grid. Links always show;
 * Replace / Attach / Remove only while the invoice is Pending, matching the
 * server rule in src/lib/accounting/invoiceDocuments.ts.
 */

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TableChartIcon from "@mui/icons-material/TableChart";
import { useState } from "react";
import { PdfUploadField, UploadedPdf } from "./PdfUploadField";

export interface InvoiceDocumentFields {
  id: string;
  invoiceNumber: string;
  paymentStatus: "Paid" | "Pending" | "Cancelled";
  invoicePdfKey: string | null;
  invoicePdfName: string | null;
  invoiceSheetKey: string | null;
  invoiceSheetName: string | null;
}

type DocumentFieldsPatch = Partial<
  Pick<
    InvoiceDocumentFields,
    "invoicePdfKey" | "invoicePdfName" | "invoiceSheetKey" | "invoiceSheetName"
  >
>;

interface InvoiceDocumentsProps {
  type: "hardware" | "vendor";
  invoice: InvoiceDocumentFields;
  /** Applies the saved change to the page's invoice state. */
  onChanged: (patch: DocumentFieldsPatch, message: string) => void;
}

const API_BASE = {
  hardware: "/api/hardware-purchases",
  vendor: "/api/vendor-invoices",
} as const;

const PURPOSES = {
  hardware: {
    pdf: "hardware-purchase-invoice",
    sheet: "hardware-purchase-sheet",
  },
  vendor: { pdf: "vendor-invoice", sheet: "vendor-invoice-sheet" },
} as const;

const keyExtension = (key: string) => key.slice(key.lastIndexOf("."));

const headingSx = { fontWeight: "600", mb: 0.5 } as const;

export function InvoiceDocuments({
  type,
  invoice,
  onChanged,
}: InvoiceDocumentsProps) {
  const [dialog, setDialog] = useState<"invoice" | "sheet" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = invoice.paymentStatus === "Pending";
  const base = `${API_BASE[type]}/${invoice.id}/documents`;

  const pdfName =
    invoice.invoicePdfName ??
    (invoice.invoicePdfKey
      ? `${invoice.invoiceNumber}${keyExtension(invoice.invoicePdfKey)}`
      : null);
  const sheetName =
    invoice.invoiceSheetName ??
    (invoice.invoiceSheetKey
      ? `${invoice.invoiceNumber}${keyExtension(invoice.invoiceSheetKey)}`
      : null);

  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setError(null);
  };

  // Saves as soon as the upload finishes, so an abandoned dialog never
  // leaves a half-done replacement behind.
  const saveUpload = async (
    kind: "invoice" | "sheet",
    uploaded: UploadedPdf | null,
  ) => {
    if (!uploaded) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/${kind}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: uploaded.key,
          fileName: uploaded.fileName,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save the file");

      const replaced =
        kind === "invoice"
          ? !!invoice.invoicePdfKey
          : !!invoice.invoiceSheetKey;
      onChanged(
        kind === "invoice"
          ? {
              invoicePdfKey: body.data.key,
              invoicePdfName: body.data.fileName,
            }
          : {
              invoiceSheetKey: body.data.key,
              invoiceSheetName: body.data.fileName,
            },
        kind === "invoice"
          ? replaced
            ? "Invoice PDF replaced"
            : "Invoice PDF attached"
          : replaced
            ? "Excel/CSV sheet replaced"
            : "Excel/CSV sheet attached",
      );
      setDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the file");
    } finally {
      setBusy(false);
    }
  };

  const removeSheet = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/sheet`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(body.error || "Failed to remove the spreadsheet");
      onChanged(
        { invoiceSheetKey: null, invoiceSheetName: null },
        "Excel/CSV sheet removed",
      );
      setConfirmRemove(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to remove the spreadsheet",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Vendor Invoice PDF */}
      <Box>
        <Typography variant="subtitle2" color="textSecondary" sx={headingSx}>
          Vendor Invoice PDF
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="body1" component="div">
            {invoice.invoicePdfKey ? (
              <MuiLink
                href={`${base}/invoice`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  wordBreak: "break-all",
                }}
              >
                <PictureAsPdfIcon fontSize="small" /> {pdfName}
              </MuiLink>
            ) : (
              "No PDF"
            )}
          </Typography>
          {editable && (
            <Button size="small" onClick={() => setDialog("invoice")}>
              {invoice.invoicePdfKey ? "Replace" : "Attach"}
            </Button>
          )}
        </Stack>
      </Box>

      {/* Vendor Invoice Excel / CSV */}
      <Box>
        <Typography variant="subtitle2" color="textSecondary" sx={headingSx}>
          Vendor Invoice Excel / CSV
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="body1" component="div">
            {invoice.invoiceSheetKey ? (
              <MuiLink
                href={`${base}/sheet`}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  wordBreak: "break-all",
                }}
              >
                <TableChartIcon fontSize="small" /> {sheetName}
              </MuiLink>
            ) : (
              "None"
            )}
          </Typography>
          {editable && (
            <>
              <Button size="small" onClick={() => setDialog("sheet")}>
                {invoice.invoiceSheetKey ? "Replace" : "Attach"}
              </Button>
              {invoice.invoiceSheetKey && (
                <Button
                  size="small"
                  color="error"
                  onClick={() => {
                    setError(null);
                    setConfirmRemove(true);
                  }}
                >
                  Remove
                </Button>
              )}
            </>
          )}
        </Stack>
      </Box>

      {/* Attach / replace */}
      <Dialog
        open={dialog !== null}
        onClose={closeDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {dialog === "invoice"
            ? invoice.invoicePdfKey
              ? "Replace invoice PDF"
              : "Attach invoice PDF"
            : invoice.invoiceSheetKey
              ? "Replace Excel / CSV sheet"
              : "Attach Excel / CSV sheet"}
        </DialogTitle>
        <DialogContent>
          {((dialog === "invoice" && invoice.invoicePdfKey) ||
            (dialog === "sheet" && invoice.invoiceSheetKey)) && (
            <DialogContentText sx={{ mb: 2 }}>
              The current file ({dialog === "invoice" ? pdfName : sheetName})
              will be deleted once the new one is saved.
            </DialogContentText>
          )}
          {dialog === "invoice" && (
            <PdfUploadField
              label="New invoice PDF"
              purpose={PURPOSES[type].pdf}
              value={null}
              onChange={(v) => saveUpload("invoice", v)}
              disabled={busy}
            />
          )}
          {dialog === "sheet" && (
            <PdfUploadField
              label="Excel / CSV sheet"
              fileKind="sheet"
              purpose={PURPOSES[type].sheet}
              value={null}
              onChange={(v) => saveUpload("sheet", v)}
              disabled={busy}
            />
          )}
          {busy && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: 2 }}
            >
              <CircularProgress size={18} />
              <Typography variant="body2">Saving...</Typography>
            </Stack>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={busy}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove sheet */}
      <Dialog
        open={confirmRemove}
        onClose={() => !busy && setConfirmRemove(false)}
      >
        <DialogTitle>Remove Excel / CSV sheet?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {sheetName} will be removed from invoice {invoice.invoiceNumber} and
            deleted from storage. This can&apos;t be undone.
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={removeSheet}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} /> : undefined}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
