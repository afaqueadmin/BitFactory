"use client";

/**
 * Address / payment-frequency / next-payout cards for one Luxor subaccount.
 * Rendered once per subaccount currently in view on the wallet page - each
 * subaccount can have a genuinely different payout address (Luxor scopes
 * payment settings per subaccount, not account-wide), so these can't be
 * combined the way the earnings/revenue totals above them are.
 */

import React, { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Tooltip,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { LuxorPaymentSettings } from "@/lib/types/wallet";
import { WalletChangeRequestItem } from "@/lib/hooks/useWalletChangeRequests";
import { RADIUS_CARD, focusRing, useDaylight } from "@/lib/daylight";

const toProperCase = (text: string): string => {
  if (!text) return "";
  return text
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

interface WalletSubaccountCardsProps {
  settings: LuxorPaymentSettings;
  isDark: boolean;
  dimmed: boolean;
  hasPendingWalletChange: boolean;
  isPayoutFrozen: boolean;
  freezeLabel: string | null;
  activeWalletChangeRequest: WalletChangeRequestItem | undefined;
  onRequestChange: () => void;
  /** Daylight styling: flat soft-tone cards instead of the saturated
   * gradients (guide §4: "do not use gradients on KPI cards"). */
  daylight?: boolean;
}

export default function WalletSubaccountCards({
  settings,
  isDark,
  dimmed,
  hasPendingWalletChange,
  isPayoutFrozen,
  freezeLabel,
  activeWalletChangeRequest,
  onRequestChange,
  daylight = false,
}: WalletSubaccountCardsProps) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const { d, fonts } = useDaylight();

  const primaryAddress = (): string => {
    if (!settings.addresses || settings.addresses.length === 0) {
      return "Not configured";
    }
    const primary = settings.addresses.reduce((prev, current) =>
      current.revenue_allocation > prev.revenue_allocation ? current : prev,
    );
    return primary.external_address;
  };

  const handleCopyAddress = () => {
    const address = primaryAddress();
    if (address && address !== "Not configured") {
      navigator.clipboard.writeText(address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  let payoutDate: Date | null = null;
  let twoHoursLaterPayoutDate: Date | null = null;
  if (settings.next_payout_at) {
    payoutDate = new Date(settings.next_payout_at);
    twoHoursLaterPayoutDate = new Date(
      payoutDate.getTime() + 2 * 60 * 60 * 1000,
    );
  }

  return (
    <>
      <Typography
        variant="caption"
        sx={{
          gridColumn: "1 / -1",
          fontWeight: 700,
          opacity: daylight ? 1 : 0.7,
          mt: 1,
          ...(daylight && { fontFamily: fonts.heading, color: d.text }),
        }}
      >
        {settings.subaccount?.name || "Subaccount"}
      </Typography>

      {/* Wallet address */}
      <Paper
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: daylight ? RADIUS_CARD : 3,
          background: daylight
            ? d.skySoft
            : isDark
              ? "linear-gradient(135deg, rgba(120, 53, 15, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
          color: daylight ? d.text : "white",
          border: `1px solid ${
            daylight
              ? d.borderSky
              : isDark
                ? "rgba(245, 158, 11, 0.3)"
                : "rgba(255,255,255,0.2)"
          }`,
          boxShadow: daylight ? d.shadow : "0 4px 20px rgba(217, 119, 6, 0.15)",
          opacity: dimmed ? 0.65 : 1,
          position: "relative",
          overflow: "hidden",
          fontFamily: daylight ? fonts.body : undefined,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              opacity: daylight ? 1 : 0.85,
              fontWeight: 600,
              fontSize: { xs: "0.75rem", sm: "0.82rem" },
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              ...(daylight && { color: d.action }),
            }}
          >
            Wallet Address
          </Typography>
          {primaryAddress() !== "Not configured" && (
            <Tooltip title={copiedAddress ? "Copied!" : "Copy Address"}>
              <IconButton
                size="small"
                onClick={handleCopyAddress}
                sx={
                  daylight
                    ? {
                        color: d.action,
                        p: 0.5,
                        backgroundColor: d.surface,
                        border: `1px solid ${d.borderSky}`,
                        "&:hover": { backgroundColor: d.hover },
                        "&:focus-visible": focusRing(d.action),
                      }
                    : {
                        color: "white",
                        p: 0.5,
                        backgroundColor: "rgba(255,255,255,0.15)",
                        "&:hover": {
                          backgroundColor: "rgba(255,255,255,0.25)",
                        },
                      }
                }
              >
                {copiedAddress ? (
                  <CheckIcon
                    sx={{
                      fontSize: 16,
                      color: daylight ? d.success : undefined,
                    }}
                  />
                ) : (
                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Typography
          variant="body2"
          sx={{
            wordBreak: "break-all",
            mt: 1,
            fontFamily: "monospace",
            fontSize: { xs: "0.78rem", sm: "0.85rem" },
            lineHeight: 1.4,
            backgroundColor: daylight ? d.surface : "rgba(0,0,0,0.15)",
            p: 0.75,
            borderRadius: daylight ? "8px" : 1.5,
            ...(daylight && { border: `1px solid ${d.border}`, color: d.text }),
          }}
        >
          {primaryAddress()}
        </Typography>

        {hasPendingWalletChange ? (
          <Typography
            variant="caption"
            sx={{
              mt: 1,
              display: "inline-block",
              backgroundColor: daylight ? d.amber : "rgba(255,255,255,0.2)",
              color: daylight ? d.warning : undefined,
              px: 1,
              py: 0.25,
              borderRadius: daylight ? "999px" : 1,
              fontWeight: 600,
            }}
          >
            {isPayoutFrozen && freezeLabel
              ? `🔒 ${freezeLabel}`
              : activeWalletChangeRequest?.status === "CONFIRMED"
                ? "✅ Confirmed — awaiting final approval"
                : "⏳ Change pending review"}
          </Typography>
        ) : (
          <Button
            size="small"
            variant="outlined"
            onClick={onRequestChange}
            sx={{
              mt: 1,
              borderRadius: daylight ? "8px" : 2,
              fontSize: "0.72rem",
              py: 0.3,
              textTransform: "none",
              fontWeight: 600,
              ...(daylight
                ? {
                    fontFamily: fonts.body,
                    color: d.action,
                    borderColor: d.action,
                    "&:hover": {
                      borderColor: d.actionHover,
                      backgroundColor: d.hover,
                    },
                  }
                : {
                    color: "white",
                    borderColor: "rgba(255,255,255,0.5)",
                    "&:hover": {
                      borderColor: "white",
                      backgroundColor: "rgba(255,255,255,0.15)",
                    },
                  }),
            }}
          >
            Request Change
          </Button>
        )}
      </Paper>

      {/* Payment frequency */}
      <Paper
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: daylight ? RADIUS_CARD : 3,
          background: daylight
            ? d.mint
            : isDark
              ? "linear-gradient(135deg, rgba(124, 45, 18, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : "linear-gradient(135deg, #ea580c 0%, #f97316 100%)",
          color: daylight ? d.text : "white",
          border: `1px solid ${
            daylight
              ? d.borderMint
              : isDark
                ? "rgba(249, 115, 22, 0.3)"
                : "rgba(255,255,255,0.2)"
          }`,
          boxShadow: daylight ? d.shadow : "0 4px 20px rgba(234, 88, 12, 0.15)",
          opacity: dimmed ? 0.65 : 1,
          fontFamily: daylight ? fonts.body : undefined,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            opacity: daylight ? 1 : 0.85,
            fontWeight: 600,
            fontSize: { xs: "0.75rem", sm: "0.82rem" },
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            display: "block",
            ...(daylight && { color: d.success }),
          }}
        >
          Payment Frequency
        </Typography>

        <Box sx={{ mt: 1 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: "1.25rem", sm: "1.45rem" },
              ...(daylight && { fontFamily: fonts.heading, color: d.text }),
            }}
          >
            {settings.payment_frequency
              ? toProperCase(settings.payment_frequency)
              : "Not set"}
          </Typography>
          {settings.payment_frequency === "WEEKLY" && settings.day_of_week && (
            <Typography
              variant="caption"
              sx={{
                mt: 0.5,
                opacity: daylight ? 1 : 0.9,
                display: "block",
                ...(daylight && { color: d.cardMuted }),
              }}
            >
              Every {toProperCase(settings.day_of_week)}
            </Typography>
          )}
        </Box>
      </Paper>

      {/* Next payout */}
      <Paper
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: daylight ? RADIUS_CARD : 3,
          background: daylight
            ? d.amber
            : isDark
              ? "linear-gradient(135deg, rgba(19, 78, 74, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
          color: daylight ? d.text : "white",
          border: `1px solid ${
            daylight
              ? d.borderAmber
              : isDark
                ? "rgba(20, 184, 166, 0.3)"
                : "rgba(255,255,255,0.2)"
          }`,
          boxShadow: daylight
            ? d.shadow
            : "0 4px 20px rgba(13, 148, 136, 0.15)",
          opacity: dimmed ? 0.65 : 1,
          fontFamily: daylight ? fonts.body : undefined,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            opacity: daylight ? 1 : 0.85,
            fontWeight: 600,
            fontSize: { xs: "0.75rem", sm: "0.82rem" },
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            display: "block",
            ...(daylight && { color: d.warning }),
          }}
        >
          Next Payout
        </Typography>

        {payoutDate && twoHoursLaterPayoutDate ? (
          <Box sx={{ mt: 1 }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: { xs: "1.1rem", sm: "1.3rem" },
                ...(daylight && { fontFamily: fonts.heading, color: d.text }),
              }}
            >
              {payoutDate.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                mt: 0.5,
                opacity: daylight ? 1 : 0.9,
                display: "block",
                ...(daylight && { color: d.cardMuted }),
              }}
            >
              {payoutDate.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              -{" "}
              {twoHoursLaterPayoutDate.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              (
              {new Intl.DateTimeFormat("en-US", {
                timeZoneName: "shortOffset",
              })
                .formatToParts(payoutDate)
                .find((part) => part.type === "timeZoneName")?.value || "GMT"}
              )
            </Typography>
          </Box>
        ) : (
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: { xs: "1.1rem", sm: "1.25rem" },
              mt: 1,
              ...(daylight && { fontFamily: fonts.heading, color: d.text }),
            }}
          >
            Not scheduled
          </Typography>
        )}
      </Paper>
    </>
  );
}
