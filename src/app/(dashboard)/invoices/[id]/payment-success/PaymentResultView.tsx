"use client";

/**
 * Daylight view for the Confirmo payment return page. The server page does
 * the auth / ownership checks and the DB read, then hands plain data here so
 * the view can follow the app's light/dark mode.
 */

import Image from "next/image";
import Link from "next/link";
import { Box, Typography } from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import {
  RADIUS_CARD,
  focusRing,
  logoFilter,
  useDaylight,
} from "@/lib/daylight";

export interface PaymentResultData {
  invoiceId: string;
  invoiceNumber: string;
  customer: string;
  customerEmail: string;
  totalMiners: number | null;
  unitPrice: string;
  totalAmount: string;
  state: "paid" | "processing" | "pending";
  payment: {
    status: string;
    paidCurrency: string | null;
    paidAmount: string | null;
    transactionHash: string | null;
    confirmedAt: string | null;
    paymentUrl: string | null;
  } | null;
}

const usd = (value: string) =>
  Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

export default function PaymentResultView({
  data,
}: {
  data: PaymentResultData;
}) {
  const { d, darkMode, fonts } = useDaylight();
  const { payment, state } = data;

  const tone = {
    paid: { bg: d.mint, fg: d.success, border: d.borderMint },
    processing: { bg: d.amber, fg: d.warning, border: d.borderAmber },
    pending: { bg: d.skySoft, fg: d.action, border: d.borderSky },
  }[state];

  const hero = {
    paid: {
      icon: <CheckCircleRoundedIcon />,
      title: "Payment successful",
      text: "Your cryptocurrency payment has been confirmed.",
    },
    processing: {
      icon: <ScheduleRoundedIcon />,
      title: "Payment processing",
      text: "Waiting for blockchain confirmation.",
    },
    pending: {
      icon: <ErrorOutlineRoundedIcon />,
      title: "Payment pending",
      text: "Complete your payment to proceed.",
    },
  }[state];

  const row = (label: string, value: React.ReactNode, mono = false) => (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 2,
        py: "8px",
        borderBottom: `1px solid ${d.border}`,
        "&:last-of-type": { borderBottom: 0 },
        fontSize: 13,
      }}
    >
      <Box component="span" sx={{ color: d.muted, flexShrink: 0 }}>
        {label}
      </Box>
      <Box
        component="span"
        sx={{
          fontWeight: 600,
          textAlign: "right",
          overflowWrap: "anywhere",
          ...(mono && {
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 12,
          }),
        }}
      >
        {value}
      </Box>
    </Box>
  );

  const sectionTitle = (text: string) => (
    <Typography
      component="h2"
      sx={{
        fontFamily: fonts.heading,
        fontWeight: 700,
        fontSize: 15,
        color: d.text,
        mb: "10px",
      }}
    >
      {text}
    </Typography>
  );

  const linkBtnSx = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    minHeight: 44,
    borderRadius: "8px",
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: 650,
    textDecoration: "none",
    "&:focus-visible": focusRing(d.action),
    "& svg": { fontSize: 18 },
  } as const;

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        bgcolor: d.canvas,
        color: d.text,
        fontFamily: fonts.body,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        px: "16px",
        py: { xs: "28px", sm: "48px" },
      }}
    >
      <Box sx={{ position: "relative", width: 210, height: 64, mb: "16px" }}>
        <Image
          src="/BitfactoryLogo.webp"
          alt="BitFactory"
          fill
          priority
          sizes="210px"
          style={{ objectFit: "cover", filter: logoFilter(darkMode) }}
        />
      </Box>

      <Box
        sx={{
          width: "100%",
          maxWidth: 600,
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
          overflow: "hidden",
        }}
      >
        {/* Status hero */}
        <Box
          sx={{
            textAlign: "center",
            px: { xs: "20px", sm: "32px" },
            pt: "32px",
            pb: "26px",
            bgcolor: tone.bg,
            borderBottom: `1px solid ${tone.border}`,
          }}
        >
          <Box
            aria-hidden
            sx={{
              mx: "auto",
              mb: "14px",
              width: 64,
              height: 64,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              bgcolor: d.surface,
              color: tone.fg,
              "& svg": { fontSize: 40 },
            }}
          >
            {hero.icon}
          </Box>
          <Typography
            component="h1"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 24, sm: 28 },
              letterSpacing: "-.03em",
              color: d.text,
            }}
          >
            {hero.title}
          </Typography>
          <Box sx={{ mt: "6px", fontSize: 14, color: d.cardMuted }}>
            {hero.text}
          </Box>
        </Box>

        {/* Invoice details */}
        <Box sx={{ px: { xs: "20px", sm: "32px" }, py: "22px" }}>
          {sectionTitle("Invoice details")}
          {row("Invoice number", data.invoiceNumber)}
          {row("Customer", data.customer)}
          {data.totalMiners !== null &&
            row("Number of miners", data.totalMiners)}
          {row("Unit price", `${usd(data.unitPrice)} / miner`)}
          <Box
            sx={{
              mt: "12px",
              pt: "12px",
              borderTop: `1px solid ${d.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 2,
            }}
          >
            <Box>
              <Box sx={{ fontSize: 13, color: d.muted }}>Total amount</Box>
              <Box sx={{ fontSize: 11.5, color: d.muted, mt: "2px" }}>
                Electricity charges for the period
              </Box>
            </Box>
            <Box
              sx={{
                fontFamily: fonts.heading,
                fontWeight: 750,
                fontSize: 24,
                letterSpacing: "-.02em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {usd(data.totalAmount)}
            </Box>
          </Box>
        </Box>

        {/* Payment information */}
        {payment && (
          <Box
            sx={{
              px: { xs: "20px", sm: "32px" },
              py: "22px",
              borderTop: `1px solid ${d.border}`,
            }}
          >
            {sectionTitle("Payment information")}
            {row(
              "Payment status",
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  px: "9px",
                  py: "2px",
                  borderRadius: "999px",
                  bgcolor: tone.bg,
                  color: tone.fg,
                  fontSize: 11,
                  fontWeight: 650,
                }}
              >
                {payment.status.charAt(0) +
                  payment.status.slice(1).toLowerCase()}
              </Box>,
            )}
            {payment.paidCurrency && row("Paid with", payment.paidCurrency)}
            {payment.paidAmount &&
              row(
                "Amount paid",
                `${payment.paidAmount} ${payment.paidCurrency ?? ""}`.trim(),
              )}
            {payment.transactionHash &&
              row(
                "Transaction hash",
                `${payment.transactionHash.slice(0, 20)}...`,
                true,
              )}
            {payment.confirmedAt &&
              row(
                "Confirmed at",
                new Date(payment.confirmedAt).toLocaleString(),
              )}
          </Box>
        )}

        {/* What happens next */}
        <Box
          sx={{
            px: { xs: "20px", sm: "32px" },
            pb: "24px",
            pt: payment ? 0 : "4px",
          }}
        >
          <Box
            role="status"
            sx={{
              p: "14px 16px",
              borderRadius: "10px",
              bgcolor: tone.bg,
              border: `1px solid ${tone.border}`,
              color: tone.fg,
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            {state === "paid" ? (
              <>
                <strong>Payment confirmed.</strong> Your invoice has been paid
                and your miners will remain active. A confirmation email has
                been sent to <strong>{data.customerEmail}</strong>.
              </>
            ) : state === "processing" ? (
              <>
                <strong>Blockchain confirmation pending.</strong> This typically
                takes 10-30 minutes. You&apos;ll receive an email once it&apos;s
                confirmed.
              </>
            ) : payment?.paymentUrl ? (
              <>
                <strong>Complete your payment.</strong> Use the button below to
                pay with cryptocurrency (BTC, ETH, USDT, USDC and more).
              </>
            ) : (
              <>Payment link not available. Please contact support.</>
            )}
          </Box>

          <Box sx={{ mt: "16px", display: "grid", gap: "10px" }}>
            {state === "pending" && payment?.paymentUrl && (
              <Box
                component="a"
                href={payment.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  ...linkBtnSx,
                  bgcolor: d.action,
                  color: d.surface,
                  "&:hover": { bgcolor: d.actionHover },
                }}
              >
                Pay now with crypto <OpenInNewRoundedIcon />
              </Box>
            )}
            <Box
              component={Link}
              href={`/invoices/${data.invoiceId}`}
              sx={{
                ...linkBtnSx,
                ...(state === "pending" && payment?.paymentUrl
                  ? {
                      border: `1px solid ${d.inputBorder}`,
                      color: d.text,
                      bgcolor: d.surface,
                      "&:hover": { bgcolor: d.hover },
                    }
                  : {
                      bgcolor: d.action,
                      color: d.surface,
                      "&:hover": { bgcolor: d.actionHover },
                    }),
              }}
            >
              <ReceiptLongOutlinedIcon /> View invoice details
            </Box>
            <Box
              component={Link}
              href="/invoices"
              sx={{
                ...linkBtnSx,
                minHeight: 40,
                color: d.action,
                fontWeight: 600,
                "&:hover": { bgcolor: d.hover },
              }}
            >
              <ArrowBackRoundedIcon /> Back to all invoices
            </Box>
          </Box>
        </Box>

        {/* Support footer */}
        <Box
          sx={{
            px: "24px",
            py: "16px",
            textAlign: "center",
            fontSize: 13,
            color: d.muted,
            bgcolor: d.tableHead,
            borderTop: `1px solid ${d.border}`,
          }}
        >
          Need help?{" "}
          <Box
            component="a"
            href="mailto:admin@bitfactory.ae"
            sx={{
              color: d.action,
              fontWeight: 600,
              textDecoration: "none",
              "&:hover": { textDecoration: "underline" },
            }}
          >
            Contact support
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
