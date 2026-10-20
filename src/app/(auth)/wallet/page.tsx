"use client";

/**
 * Wallet page (authenticated) - BitFactory Daylight theme (v1.3)
 *
 * Composes:
 * - WalletOverview: heading, balance hero, per-subaccount cards and the
 *   P&L chart (shared with the admin's emailed PDF snapshot)
 * - Statement download card
 * - Wallet Change Requests (Daylight WalletChangeRequestHistory)
 * - Payment Frequency Requests (Daylight PaymentFrequencyChangeRequestHistory)
 * - ElectricityCostTable (Daylight variant)
 */

import React, { useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  TextField,
  Alert,
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ElectricityCostTable from "@/components/ElectricityCostTable";
import { LuxorPaymentSettings } from "@/lib/types/wallet";
import { useWalletChangeRequests } from "@/lib/hooks/useWalletChangeRequests";
import RequestWalletChangeModal from "@/components/wallet/RequestWalletChangeModal";
import WalletChangeRequestHistory from "@/components/wallet/WalletChangeRequestHistory";
import WalletOverview from "@/components/wallet/WalletOverview";
import { usePaymentFrequencyChangeRequests } from "@/lib/hooks/usePaymentFrequencyChangeRequests";
import RequestPaymentFrequencyChangeModal from "@/components/wallet/RequestPaymentFrequencyChangeModal";
import PaymentFrequencyChangeRequestHistory from "@/components/wallet/PaymentFrequencyChangeRequestHistory";
import { useFreezeRemaining } from "@/components/wallet/FreezeCountdown";
import { useSubaccountFilter } from "@/lib/contexts/subaccountFilter-context";
import { MQ, RADIUS_CARD, useDaylight } from "@/lib/daylight";

export default function WalletPage() {
  const { d, fonts } = useDaylight();

  // Statement download state
  const [statementStartDate, setStatementStartDate] = useState<string>("");
  const [statementEndDate, setStatementEndDate] = useState<string>("");
  const [statementError, setStatementError] = useState<string | null>(null);
  const [statementDownloading, setStatementDownloading] = useState(false);

  // Wallet change request state - which subaccount's card opened the modal
  const [requestChangeSubaccount, setRequestChangeSubaccount] =
    useState<LuxorPaymentSettings | null>(null);
  const { requests: walletChangeRequests } = useWalletChangeRequests();
  const activeWalletChangeRequest = walletChangeRequests.find(
    (req) => req.status === "PENDING" || req.status === "CONFIRMED",
  );
  const latestApprovedRequest = walletChangeRequests
    .filter((req) => req.status === "APPROVED")
    .sort(
      (a, b) =>
        new Date(b.reviewedAt ?? 0).getTime() -
        new Date(a.reviewedAt ?? 0).getTime(),
    )[0];
  const { isFrozen: isPayoutFrozen, label: freezeLabel } = useFreezeRemaining(
    latestApprovedRequest?.reviewedAt,
  );
  const hasPendingWalletChange = !!activeWalletChangeRequest || isPayoutFrozen;

  // Payment frequency change request state - one open request is allowed
  // per subaccount, so each card looks up its own by subaccount name.
  const [frequencyChangeSubaccount, setFrequencyChangeSubaccount] =
    useState<LuxorPaymentSettings | null>(null);
  const { requests: frequencyChangeRequests } =
    usePaymentFrequencyChangeRequests();
  const activeFrequencyChangeFor = (subaccountName: string | undefined) =>
    frequencyChangeRequests.find(
      (req) =>
        req.subaccountName === subaccountName &&
        (req.status === "PENDING" || req.status === "CONFIRMED"),
    );

  const { queryParam: subaccountsParam } = useSubaccountFilter();

  const cardActions = (settings: LuxorPaymentSettings) => ({
    hasPendingWalletChange,
    isPayoutFrozen,
    freezeLabel,
    activeWalletChangeRequest,
    onRequestChange: () => setRequestChangeSubaccount(settings),
    activeFrequencyChangeRequest: activeFrequencyChangeFor(
      settings.subaccount?.name,
    ),
    onRequestFrequencyChange: () => setFrequencyChangeSubaccount(settings),
  });

  // Handle statement download
  const handleDownloadStatement = async () => {
    try {
      setStatementError(null);

      if (!statementStartDate || !statementEndDate) {
        setStatementError("Both start and end dates are required");
        return;
      }

      const startDate = new Date(statementStartDate);
      const endDate = new Date(statementEndDate);

      if (startDate > endDate) {
        setStatementError("Start date must be before end date");
        return;
      }

      const monthsDiff =
        (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth());

      if (monthsDiff > 12) {
        setStatementError("Date range cannot exceed 12 months");
        return;
      }

      setStatementDownloading(true);

      const params = new URLSearchParams({
        startDate: statementStartDate,
        endDate: statementEndDate,
      });

      const response = await fetch(`/api/wallet/statement?${params}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate statement");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const startFormatted = statementStartDate.split("-").reverse().join("-");
      const endFormatted = statementEndDate.split("-").reverse().join("-");
      a.download = `account-statement-${startFormatted}-to-${endFormatted}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to download statement";
      setStatementError(errorMessage);
      console.error("Statement download error:", error);
    } finally {
      setStatementDownloading(false);
    }
  };

  const sectionHeading = (text: string) => (
    <Typography
      component="h2"
      sx={{
        fontFamily: fonts.heading,
        fontWeight: 750,
        fontSize: 18,
        letterSpacing: "-.035em",
        color: d.text,
        mb: "14px",
      }}
    >
      {text}
    </Typography>
  );

  return (
    <Box
      sx={{ maxWidth: 1600, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      <WalletOverview
        subaccountsParam={subaccountsParam}
        cardActions={cardActions}
      />

      {/* Statement Download Section */}
      <Box sx={{ width: "100%", mt: { xs: "20px", md: "26px" } }}>
        <Box
          sx={{
            p: { xs: "20px", sm: "24px" },
            borderRadius: RADIUS_CARD,
            bgcolor: d.surface,
            border: `1px solid ${d.border}`,
            boxShadow: d.shadow,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              mb: "6px",
            }}
          >
            <Box
              aria-hidden
              sx={{
                display: "grid",
                placeItems: "center",
                width: 33,
                height: 33,
                borderRadius: "8px",
                bgcolor: d.skySoft,
                color: d.action,
                flexShrink: 0,
              }}
            >
              <PictureAsPdfIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography
              sx={{
                fontFamily: fonts.heading,
                fontWeight: 750,
                fontSize: 16,
                color: d.text,
              }}
            >
              Download Account Statement
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 12, color: d.muted, mb: "18px" }}>
            Select a date range (max 12 months) to generate and download your
            account statement as PDF.
          </Typography>

          {statementError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {statementError}
            </Alert>
          )}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr auto" },
              gap: "12px",
              alignItems: "flex-end",
            }}
          >
            <TextField
              label="Start Date"
              type="date"
              value={statementStartDate}
              onChange={(e) => {
                setStatementStartDate(e.target.value);
                setStatementError(null);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              inputProps={{ max: new Date().toISOString().split("T")[0] }}
              fullWidth
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                  bgcolor: d.surface,
                  "& fieldset": { borderColor: d.inputBorder },
                  "&:hover fieldset": { borderColor: d.action },
                },
                "& .MuiOutlinedInput-root.Mui-focused fieldset": {
                  borderColor: d.action,
                },
              }}
            />
            <TextField
              label="End Date"
              type="date"
              value={statementEndDate}
              onChange={(e) => {
                setStatementEndDate(e.target.value);
                setStatementError(null);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              inputProps={{ max: new Date().toISOString().split("T")[0] }}
              fullWidth
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                  bgcolor: d.surface,
                  "& fieldset": { borderColor: d.inputBorder },
                  "&:hover fieldset": { borderColor: d.action },
                },
                "& .MuiOutlinedInput-root.Mui-focused fieldset": {
                  borderColor: d.action,
                },
              }}
            />
            <Button
              variant="contained"
              onClick={handleDownloadStatement}
              disabled={
                statementDownloading || !statementStartDate || !statementEndDate
              }
              fullWidth
              sx={{
                whiteSpace: "nowrap",
                borderRadius: "8px",
                py: { xs: 1, sm: 0.9 },
                fontWeight: 600,
                textTransform: "none",
                fontFamily: fonts.body,
                bgcolor: d.action,
                boxShadow: "none",
                "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
                [MQ.mobile]: { minHeight: 44 },
              }}
            >
              {statementDownloading ? (
                <>
                  <CircularProgress size={18} sx={{ mr: 1, color: "white" }} />
                  Generating PDF...
                </>
              ) : (
                "Download PDF"
              )}
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Wallet Change Requests */}
      <Box sx={{ width: "100%", mt: { xs: "20px", md: "26px" } }}>
        {sectionHeading("Wallet Change Requests")}
        <WalletChangeRequestHistory daylight />
      </Box>

      {/* Payment Frequency Change Requests */}
      <Box sx={{ width: "100%", mt: { xs: "20px", md: "26px" } }}>
        {sectionHeading("Payment Frequency Requests")}
        <PaymentFrequencyChangeRequestHistory daylight />
      </Box>

      {frequencyChangeSubaccount && (
        <RequestPaymentFrequencyChangeModal
          open={!!frequencyChangeSubaccount}
          onClose={() => setFrequencyChangeSubaccount(null)}
          subaccountName={
            frequencyChangeSubaccount.subaccount?.name ||
            String(frequencyChangeSubaccount.subaccount?.id ?? "")
          }
          currentFrequency={frequencyChangeSubaccount.payment_frequency}
          currentDayOfWeek={frequencyChangeSubaccount.day_of_week}
        />
      )}

      {requestChangeSubaccount && (
        <RequestWalletChangeModal
          open={!!requestChangeSubaccount}
          onClose={() => setRequestChangeSubaccount(null)}
          subaccountName={
            requestChangeSubaccount.subaccount?.name ||
            String(requestChangeSubaccount.subaccount?.id ?? "")
          }
          currentAddress={
            requestChangeSubaccount.addresses &&
            requestChangeSubaccount.addresses.length > 0
              ? requestChangeSubaccount.addresses.reduce((prev, current) =>
                  current.revenue_allocation > prev.revenue_allocation
                    ? current
                    : prev,
                ).external_address
              : "Not configured"
          }
        />
      )}

      {/* Electricity Cost Table - the component sets its own top margin */}
      <ElectricityCostTable daylight />
    </Box>
  );
}
