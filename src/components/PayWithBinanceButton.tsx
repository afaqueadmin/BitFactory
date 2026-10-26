"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import confetti from "canvas-confetti";
import { useDaylight } from "@/lib/daylight";
import { useQueryClient } from "@tanstack/react-query";

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 60 * 60 * 1000;

interface BinanceNetwork {
  network: string;
  address: string;
  qrDataUrl: string;
}

interface BinanceCheckout {
  amount: string;
  currency: string;
  networks: BinanceNetwork[];
}

interface PayWithBinanceButtonProps {
  invoiceId: string;
  disabled?: boolean;
}

export default function PayWithBinanceButton({
  invoiceId,
  disabled,
}: PayWithBinanceButtonProps) {
  const { d, fonts } = useDaylight();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<BinanceCheckout | null>(null);
  const [paid, setPaid] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const confettiFired = useRef(false);

  const open = !!checkout;

  useEffect(() => {
    if (!open || paid) return;
    const startedAt = Date.now();
    let cancelled = false;

    const check = async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setTimedOut(true);
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch(
          `/api/checkPaymentReceived2?invoiceId=${encodeURIComponent(invoiceId)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.paid) setPaid(true);
      } catch {
        // Network hiccup: try again on the next tick.
      }
    };

    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, paid, invoiceId]);

  useEffect(() => {
    if (!paid || confettiFired.current) return;
    confettiFired.current = true;
    // Above the MUI Dialog (z-index 1300).
    confetti({
      particleCount: 180,
      spread: 90,
      origin: { y: 0.6 },
      zIndex: 2000,
    });
    queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }, [paid, invoiceId, queryClient]);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/binanceDeposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to start payment");
      setPaid(false);
      setTimedOut(false);
      confettiFired.current = false;
      setCheckout(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context): the address is still selectable.
    }
  }

  return (
    <>
      <Button
        variant="contained"
        onClick={handleClick}
        disabled={disabled || loading}
        startIcon={
          loading ? (
            <CircularProgress size={16} sx={{ color: "inherit" }} />
          ) : undefined
        }
        sx={{
          textTransform: "none",
          fontFamily: fonts.body,
          fontWeight: 650,
          fontSize: 13,
          minHeight: 42,
          px: "18px",
          borderRadius: "8px",
          boxShadow: "none",
          bgcolor: d.action,
          color: d.surface,
          "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
          "&.Mui-disabled": { bgcolor: d.border, color: d.muted },
        }}
      >
        Pay with Binance
      </Button>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}

      <Dialog
        open={open}
        onClose={() => setCheckout(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Pay with Binance (USDT)</DialogTitle>
        <DialogContent>
          {paid ? (
            <Box sx={{ textAlign: "center", py: 6 }}>
              <CheckCircleIcon color="success" sx={{ fontSize: 96 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 2 }}>
                Payment received
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Thank you! Your invoice is now marked as paid and a confirmation
                email is on its way.
              </Typography>
            </Box>
          ) : (
            checkout && (
              <>
                <Typography sx={{ mb: 1 }}>
                  Send exactly{" "}
                  <strong>
                    {checkout.amount} {checkout.currency}
                  </strong>{" "}
                  to one of the addresses below.
                </Typography>
                <Alert severity="warning" sx={{ mb: 3 }}>
                  Send USDT only, on the network shown under the QR code you
                  use. The amount that arrives <b>must match exactly</b>, so
                  make sure any network or withdrawal fee is added on top.
                </Alert>

                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={3}
                  justifyContent="center"
                >
                  {checkout.networks.map((n) => (
                    <Box
                      key={n.network}
                      sx={{
                        flex: 1,
                        textAlign: "center",
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 2,
                        p: 2,
                        minWidth: 0,
                      }}
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        USDT · {n.network}
                      </Typography>
                      <Box
                        component="img"
                        src={n.qrDataUrl}
                        alt={`USDT ${n.network} deposit address QR code`}
                        sx={{
                          width: "100%",
                          maxWidth: 240,
                          aspectRatio: "1",
                          mx: "auto",
                          my: 1.5,
                          display: "block",
                        }}
                      />
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="center"
                        spacing={0.5}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: "monospace",
                            wordBreak: "break-all",
                          }}
                        >
                          {n.address}
                        </Typography>
                        <Tooltip
                          title={
                            copied === n.address ? "Copied" : "Copy address"
                          }
                        >
                          <IconButton
                            size="small"
                            onClick={() => copyAddress(n.address)}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Box>
                  ))}
                </Stack>

                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  justifyContent="center"
                  sx={{ mt: 3 }}
                >
                  {timedOut ? (
                    <Typography color="text.secondary">
                      Still waiting? If you&apos;ve already paid, please contact
                      support with your transaction ID.
                    </Typography>
                  ) : (
                    <>
                      <CircularProgress size={20} />
                      <Typography color="text.secondary">
                        Waiting for payment… this updates automatically.
                      </Typography>
                    </>
                  )}
                </Stack>
              </>
            )
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCheckout(null)}>
            {paid ? "Done" : "Close"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
