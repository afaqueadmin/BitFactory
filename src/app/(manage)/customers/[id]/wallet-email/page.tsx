"use client";

/**
 * Compose and send the "wallet snapshot" email: a PDF of the customer's
 * wallet overview (exactly what they see at the top of /wallet, down to the
 * P&L chart) attached to an admin-editable email. Opened in a new tab from
 * the customer detail page and the Simulated Accounts page.
 */

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import {
  PictureAsPdf as PictureAsPdfIcon,
  Refresh as RefreshIcon,
  Send as SendIcon,
} from "@mui/icons-material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWalletSnapshotEmailHTML } from "@/lib/email-templates/wallet-snapshot-email";
import WalletOverview from "@/components/wallet/WalletOverview";
import WalletSnapshotHeading from "@/components/wallet/WalletSnapshotHeading";
import { ThemeContext } from "@/app/theme-provider";
import { useDaylight } from "@/lib/daylight";

interface ComposeData {
  customer: {
    id: string;
    name: string | null;
    email: string;
    isSimulated: boolean;
  };
  secondaryEmails: string[];
  rm: { name: string; email: string } | null;
  invoicesEmail: string;
  defaultSubject: string;
  defaultBody: string;
}

// Layout width of the /wallet-snapshot page the PDF is printed from.
const SNAPSHOT_WIDTH = 1200;

const lightTheme = createTheme({ palette: { mode: "light" } });
const forcedLight = { darkMode: false, toggleDarkMode: () => {} };

/**
 * Live preview of the PDF content: the same WalletOverview the
 * /wallet-snapshot page renders, in the light theme at the snapshot width,
 * scaled to fit its column. (The app is served with X-Frame-Options: DENY,
 * so the snapshot page itself can't be iframed.)
 */
function SnapshotPreview({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [contentHeight, setContentHeight] = useState(1200);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const update = () => {
      setScale(container.clientWidth / SNAPSHOT_WIDTH);
      setContentHeight(content.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        height: contentHeight * scale,
        overflow: "hidden",
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
      }}
    >
      <ThemeContext.Provider value={forcedLight}>
        <ThemeProvider theme={lightTheme}>
          <SnapshotCanvas
            ref={contentRef}
            customerId={customerId}
            customerName={customerName}
            scale={scale}
          />
        </ThemeProvider>
      </ThemeContext.Provider>
    </Box>
  );
}

// Inside the forced-light providers, so useDaylight() gives the light palette.
const SnapshotCanvas = React.forwardRef<
  HTMLDivElement,
  { customerId: string; customerName: string | null; scale: number }
>(function SnapshotCanvas({ customerId, customerName, scale }, ref) {
  const { d, fonts } = useDaylight();
  const [generatedAt] = useState(() => new Date());
  return (
    <Box
      ref={ref}
      sx={{
        width: SNAPSHOT_WIDTH,
        p: "32px 36px",
        backgroundColor: d.canvas,
        color: d.text,
        fontFamily: fonts.body,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        pointerEvents: "none",
      }}
    >
      <WalletOverview
        customerId={customerId}
        subaccountsParam="all"
        snapshot
        heading={
          <WalletSnapshotHeading
            customerName={customerName}
            generatedAt={generatedAt}
          />
        }
      />
    </Box>
  );
});

export default function WalletEmailPage() {
  const { id: customerId } = useParams<{ id: string }>();

  const [data, setData] = useState<ComposeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ccSecondary, setCcSecondary] = useState(true);
  const [ccRm, setCcRm] = useState(true);
  const [ccInvoices, setCcInvoices] = useState(true);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<
    { ok: true; message: string } | { ok: false; message: string } | null
  >(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(
          `/api/admin/customers/${encodeURIComponent(customerId)}/wallet-email`,
          { credentials: "include" },
        );
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to load customer");
        }
        const compose = json as ComposeData;
        setData(compose);
        setSubject(compose.defaultSubject);
        setBody(compose.defaultBody);
        setCcRm(!!compose.rm);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load customer",
        );
      }
    };
    load();
  }, [customerId]);

  const ccList = useMemo(() => {
    if (!data) return [];
    return [
      ...(ccSecondary ? data.secondaryEmails : []),
      ...(ccRm && data.rm ? [data.rm.email] : []),
      ...(ccInvoices ? [data.invoicesEmail] : []),
    ];
  }, [data, ccSecondary, ccRm, ccInvoices]);

  const emailPreviewHtml = useMemo(
    () => renderWalletSnapshotEmailHTML(body),
    [body],
  );

  const handleSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setSendResult(null);
    try {
      const response = await fetch(
        `/api/admin/customers/${encodeURIComponent(customerId)}/wallet-email`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            body,
            ccSecondary,
            ccRm,
            ccInvoices,
          }),
        },
      );
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to send the email");
      }
      setSendResult({
        ok: true,
        message: `Wallet snapshot sent to ${json.sentTo}${
          json.ccEmails?.length ? ` (CC: ${json.ccEmails.join(", ")})` : ""
        }.`,
      });
    } catch (error) {
      setSendResult({
        ok: false,
        message:
          error instanceof Error ? error.message : "Failed to send the email",
      });
    } finally {
      setSending(false);
    }
  };

  if (loadError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{loadError}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  const canSend = !sending && subject.trim() !== "" && body.trim() !== "";

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: "auto" }}>
      <Typography variant="h5" fontWeight="bold">
        Email Wallet Snapshot
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {data.customer.name || data.customer.email}
        {data.customer.isSimulated ? " (simulated account)" : ""} - a PDF of
        their wallet page, down to the Profit &amp; Loss chart, is attached.
      </Typography>

      {sendResult && (
        <Alert
          severity={sendResult.ok ? "success" : "error"}
          sx={{ mb: 2 }}
          onClose={() => setSendResult(null)}
        >
          {sendResult.message}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 1fr) minmax(0, 1fr)",
          },
          gap: 3,
          alignItems: "start",
        }}
      >
        {/* Email */}
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
            Email
          </Typography>

          <TextField
            label="To"
            value={data.customer.email}
            fullWidth
            size="small"
            slotProps={{ input: { readOnly: true } }}
            sx={{ mb: 2 }}
          />

          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            CC
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", mb: 2 }}>
            {data.secondaryEmails.length > 0 && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={ccSecondary}
                    onChange={(e) => setCcSecondary(e.target.checked)}
                  />
                }
                label={`Secondary sign-in email (${data.secondaryEmails.join(", ")})`}
              />
            )}
            <FormControlLabel
              disabled={!data.rm}
              control={
                <Checkbox
                  checked={!!data.rm && ccRm}
                  onChange={(e) => setCcRm(e.target.checked)}
                />
              }
              label={
                data.rm
                  ? `Relationship manager (${data.rm.name}, ${data.rm.email})`
                  : "Relationship manager (no RM assigned)"
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={ccInvoices}
                  onChange={(e) => setCcInvoices(e.target.checked)}
                />
              }
              label={`Invoices inbox (${data.invoicesEmail})`}
            />
          </Box>

          <TextField
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
          />
          <TextField
            label="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            fullWidth
            multiline
            minRows={8}
            helperText="Leave a blank line between paragraphs. Links are made clickable."
            sx={{ mb: 1 }}
          />
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => {
              setSubject(data.defaultSubject);
              setBody(data.defaultBody);
            }}
            sx={{ mb: 2 }}
          >
            Reset to default
          </Button>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Email preview
          </Typography>
          <Box
            component="iframe"
            title="Email preview"
            srcDoc={emailPreviewHtml}
            sandbox=""
            sx={{
              width: "100%",
              height: 420,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
              backgroundColor: "#fff",
            }}
          />

          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
            <Button
              variant="contained"
              startIcon={
                sending ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <SendIcon />
                )
              }
              disabled={!canSend}
              onClick={() => setConfirmOpen(true)}
            >
              {sending ? "Generating PDF and sending..." : "Send email"}
            </Button>
          </Box>
        </Paper>

        {/* PDF */}
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 2,
              mb: 2,
              flexWrap: "wrap",
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight="bold">
                Attached PDF
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Live preview of the PDF content. Use Preview PDF for the exact
                file; figures are fetched again when the email is sent.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PictureAsPdfIcon />}
              href={`/api/admin/customers/${encodeURIComponent(customerId)}/wallet-email/pdf`}
              target="_blank"
              rel="noopener"
            >
              Preview PDF
            </Button>
          </Box>
          <SnapshotPreview
            customerId={customerId}
            customerName={data.customer.name}
          />
        </Paper>
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Send wallet snapshot?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>To:</strong> {data.customer.email}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>CC:</strong>{" "}
            {ccList.length > 0 ? ccList.join(", ") : "None"}
          </Typography>
          <Typography variant="body2">
            <strong>Subject:</strong> {subject}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSend}>
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
