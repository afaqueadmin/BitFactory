"use client";

import { useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Alert,
} from "@mui/material";
import CurrencyBitcoinIcon from "@mui/icons-material/CurrencyBitcoin";
import CloseIcon from "@mui/icons-material/Close";

interface PayWithBitcoinButtonProps {
  invoiceId: string;
  disabled?: boolean; // e.g. pass true if invoice is already paid
}

export default function PayWithBitcoinButton({
  invoiceId,
  disabled,
}: PayWithBitcoinButtonProps) {
  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/invoices/${invoiceId}/btcpay`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create payment");
      }

      const data = await res.json();
      setCheckoutUrl(data.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setCheckoutUrl(null);
  }

  return (
    <>
      <Button
        variant="contained"
        onClick={handleClick}
        disabled={disabled || loading}
        startIcon={
          loading ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            <CurrencyBitcoinIcon />
          )
        }
        sx={{
          bgcolor: "#f7931a", // Bitcoin orange
          "&:hover": { bgcolor: "#e0850e" },
          textTransform: "none",
          fontWeight: 600,
        }}
      >
        {loading ? "Preparing invoice..." : "Pay with Bitcoin"}
      </Button>

      {error && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Dialog
        open={Boolean(checkoutUrl)}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, overflow: "hidden" },
        }}
      >
        <IconButton
          onClick={handleClose}
          aria-label="Close"
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 1,
            bgcolor: "background.paper",
            boxShadow: 1,
            "&:hover": { bgcolor: "grey.100" },
          }}
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <DialogContent sx={{ p: 0, height: 650 }}>
          {checkoutUrl && (
            <iframe
              src={checkoutUrl}
              title="Bitcoin payment"
              style={{ width: "100%", height: "100%", border: "none" }}
              allow="clipboard-write"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
