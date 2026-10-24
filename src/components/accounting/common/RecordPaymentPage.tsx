"use client";

import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Typography,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { useInvoice, useRecordPayment } from "@/lib/hooks/useInvoices";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { AmountDueInCurrency } from "@/components/accounting/common/AmountDueInCurrency";
import {
  PaymentPartValue,
  PaymentPartsFields,
  isPartComplete,
  newPaymentPart,
  partsEnteredAmount,
  partsPayload,
  partsTotalUsd,
} from "@/components/accounting/common/PaymentPartsFields";
import { CostPayment } from "@prisma/client";
import {
  lineItemBucket,
  type LineItemBucket,
} from "@/lib/accounting/hostingMonths";
import type { SavedLineItem } from "@/components/accounting/invoices/InvoiceLineItemsTable";
import { DaylightThemedPage } from "@/components/daylight/DaylightMuiScope";

interface RecordPaymentPageProps {
  basePath: string;
}

/** Mark as Paid: one part per section, amounts cleared. */
const clearAmounts = (parts: PaymentPartValue[]) =>
  parts.slice(0, 1).map((p) => ({ ...p, amount: "" }));

/**
 * Whether a section's parts can be submitted. With Mark as Paid only the
 * account and rate are needed (a zero-amount payment is recorded);
 * otherwise every part needs an amount > 0.
 */
const sectionReady = (parts: PaymentPartValue[], markAsPaid: boolean) =>
  parts.length > 0 &&
  parts.every((p) => isPartComplete(p, { allowZeroAmount: markAsPaid }));

export default function RecordPaymentPage({
  basePath,
}: RecordPaymentPageProps) {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const invoiceHref = `${basePath}/${invoiceId}`;

  const { invoice, loading: invoiceLoading } = useInvoice(invoiceId);
  const {
    recordPayment,
    loading: paymentLoading,
    error: paymentError,
  } = useRecordPayment();

  const [formData, setFormData] = useState({
    paymentDate: new Date().toISOString().split("T")[0],
    notes: "",
    hostingNotes: "",
    markAsPaid: false,
  });
  // The payment's currency parts, each with its own receiving account,
  // currency, rate and amount (typed text, in that currency). The split
  // form has a separate list for the hosting section.
  const [parts, setParts] = useState<PaymentPartValue[]>(() => [
    newPaymentPart(),
  ]);
  const [hostingParts, setHostingParts] = useState<PaymentPartValue[]>(() => [
    newPaymentPart(),
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hardware-sales invoices that also bill Hosting & Colocation (one or more months)
  // get a two-section payment form. Invoices without a hosting line item
  // (including every invoice created before this feature) keep the single
  // "Amount Paid" form.
  const hasHostingLineItem =
    Array.isArray(invoice?.lineItems) &&
    invoice.lineItems.some(
      (li: { lineItemType?: string }) =>
        li.lineItemType === "HOSTING_COLOCATION",
    );
  const isSplitPayment =
    invoice?.invoiceType === "HARDWARE_SALES" && hasHostingLineItem;

  // Voided payments (e.g. reversed memo adjustments) don't count as paid.
  const activePayments: CostPayment[] = (invoice?.costPayments ?? []).filter(
    (payment: CostPayment) => !payment.isDeleted,
  );

  // Calculate paid amount from cost payments (USD)
  const paidAmount = activePayments.reduce(
    (sum: number, payment: CostPayment) => sum + payment.amount,
    0,
  );

  const outstandingAmount = invoice
    ? Number(invoice.totalAmount) - paidAmount
    : 0;

  // A discount (stored negative) counts towards the bucket of the row it
  // sits under.
  const savedLineItems: SavedLineItem[] =
    invoice && Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const bucketSubtotal = (bucket: LineItemBucket) =>
    savedLineItems
      .filter((li) => lineItemBucket(li, savedLineItems) === bucket)
      .reduce((sum, li) => sum + Number(li.totalPrice), 0);
  const hardwareSubtotal = bucketSubtotal("HARDWARE");
  const hostingSubtotal = bucketSubtotal("HOSTING");
  const hardwarePaid = activePayments
    .filter((p: CostPayment) => p.type === "HARDWARE_SALES")
    .reduce((sum: number, p: CostPayment) => sum + p.amount, 0);
  const hostingPaid = activePayments
    .filter((p: CostPayment) => p.type === "PAYMENT")
    .reduce((sum: number, p: CostPayment) => sum + p.amount, 0);
  const hardwareOutstanding = hardwareSubtotal - hardwarePaid;
  const hostingOutstanding = hostingSubtotal - hostingPaid;

  // Entered amounts (any currency, for "> 0" checks) and their USD value.
  const enteredAmount = partsEnteredAmount(parts);
  const enteredHosting = isSplitPayment ? partsEnteredAmount(hostingParts) : 0;
  const enteredTotal = enteredAmount + enteredHosting;
  const enteredTotalUsd =
    partsTotalUsd(parts) + (isSplitPayment ? partsTotalUsd(hostingParts) : 0);

  // On the split form a section with nothing entered is left out; with
  // Mark as Paid both sections are recorded (as zero-amount payments).
  const { markAsPaid } = formData;
  const sendHardware = markAsPaid || !isSplitPayment || enteredAmount > 0;
  const sendHosting = isSplitPayment && (markAsPaid || enteredHosting > 0);
  const canSubmit =
    (sendHardware || sendHosting) &&
    (!sendHardware || sectionReady(parts, markAsPaid)) &&
    (!sendHosting || sectionReady(hostingParts, markAsPaid));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = e.target;
    const fieldValue = type === "checkbox" ? checked : value;

    if (name === "markAsPaid" && checked) {
      setParts(clearAmounts);
      setHostingParts(clearAmounts);
    }
    setFormData((prev) => ({
      ...prev,
      [name]: fieldValue,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      // Validate
      if (!markAsPaid && isSplitPayment && !sendHardware && !sendHosting) {
        throw new Error(
          "Enter a Hardware Sales Payment amount and/or a Hosting and Colocation Payment amount greater than 0",
        );
      }
      if (!canSubmit) {
        throw new Error(
          markAsPaid
            ? "Select the entity, bank and currency, and enter the exchange rate"
            : "Complete every currency part: entity, bank, currency, exchange rate and an amount greater than 0",
        );
      }

      // Call API to record payment
      await recordPayment(invoiceId, {
        paymentDate: formData.paymentDate,
        notes: formData.notes,
        markAsPaid,
        parts: sendHardware ? partsPayload(parts) : [],
        ...(isSplitPayment
          ? {
              hostingParts: sendHosting ? partsPayload(hostingParts) : [],
              hostingNotes: formData.hostingNotes,
            }
          : {}),
      });

      // Redirect back to invoice detail
      router.push(invoiceHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setLoading(false);
    }
  };

  if (invoiceLoading) {
    return (
      <DaylightThemedPage>
        <Container
          sx={{ display: "flex", justifyContent: "center" }}
          disableGutters
        >
          <CircularProgress />
        </Container>
      </DaylightThemedPage>
    );
  }

  if (!invoice) {
    return (
      <DaylightThemedPage>
        <Container disableGutters>
          <Alert severity="error">Invoice not found</Alert>
        </Container>
      </DaylightThemedPage>
    );
  }

  if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
    return (
      <DaylightThemedPage>
        <Container disableGutters>
          <Alert severity="warning">
            Cannot record payment for {invoice.status.toLowerCase()} invoices
          </Alert>
        </Container>
      </DaylightThemedPage>
    );
  }

  const busy = loading || paymentLoading;

  return (
    <DaylightThemedPage>
      <Container maxWidth="md" disableGutters>
        <Stack spacing={1} sx={{ mb: 4, alignItems: "flex-start" }}>
          <Link href={invoiceHref}>
            <Button startIcon={<ArrowBackIcon />}>Back to Invoice</Button>
          </Link>
          <Box flex={1}>
            <h1 style={{ margin: 0 }}>Record Payment</h1>
            <p style={{ margin: "8px 0 0 0", color: "var(--dl-muted, #666)" }}>
              Invoice: {invoice.invoiceNumber}
            </p>
          </Box>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        {paymentError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {paymentError}
          </Alert>
        )}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
            gap: 3,
            "& > *": { minWidth: 0 },
          }}
        >
          {/* Payment Form */}
          <Paper sx={{ p: 4 }}>
            <form onSubmit={handleSubmit}>
              <Stack spacing={3}>
                {isSplitPayment ? (
                  <>
                    <Box>
                      <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                        Hardware Sales Payment
                      </h3>
                      <Stack spacing={2}>
                        <PaymentPartsFields
                          parts={parts}
                          onChange={setParts}
                          disabled={busy}
                          amountsDisabled={markAsPaid}
                          targetUsd={hardwareOutstanding}
                          amountLabel="hardware sales payment"
                        />
                        <TextField
                          label="Notes (Optional)"
                          name="notes"
                          multiline
                          rows={2}
                          value={formData.notes}
                          onChange={handleInputChange}
                          fullWidth
                          helperText="Add any notes about this payment"
                        />
                      </Stack>
                    </Box>

                    <Box>
                      <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                        Hosting and Colocation Payment
                      </h3>
                      <Stack spacing={2}>
                        <PaymentPartsFields
                          parts={hostingParts}
                          onChange={setHostingParts}
                          disabled={busy}
                          amountsDisabled={markAsPaid}
                          targetUsd={hostingOutstanding}
                          amountLabel="hosting and colocation payment"
                        />
                        <TextField
                          label="Notes (Optional)"
                          name="hostingNotes"
                          multiline
                          rows={2}
                          value={formData.hostingNotes}
                          onChange={handleInputChange}
                          fullWidth
                          helperText="Add any notes about this payment"
                        />
                      </Stack>
                    </Box>

                    <Box>
                      <Stack spacing={2}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              name="markAsPaid"
                              checked={formData.markAsPaid}
                              onChange={handleInputChange}
                            />
                          }
                          label="Mark as Paid"
                        />
                        <TextField
                          label="Payment Date"
                          name="paymentDate"
                          type="date"
                          value={formData.paymentDate}
                          onChange={handleInputChange}
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          helperText="When the payment was received (applies to both sections)"
                          required
                        />
                      </Stack>
                    </Box>
                  </>
                ) : (
                  <Box>
                    <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                      Payment Details
                    </h3>
                    <Stack spacing={2}>
                      <PaymentPartsFields
                        parts={parts}
                        onChange={setParts}
                        disabled={busy}
                        amountsDisabled={markAsPaid}
                        targetUsd={outstandingAmount}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            name="markAsPaid"
                            checked={formData.markAsPaid}
                            onChange={handleInputChange}
                          />
                        }
                        label="Mark as Paid"
                      />
                      <TextField
                        label="Payment Date"
                        name="paymentDate"
                        type="date"
                        value={formData.paymentDate}
                        onChange={handleInputChange}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        helperText="When the payment was received"
                        required
                      />
                      <TextField
                        label="Notes (Optional)"
                        name="notes"
                        multiline
                        rows={3}
                        value={formData.notes}
                        onChange={handleInputChange}
                        fullWidth
                        helperText="Add any notes about this payment"
                      />
                    </Stack>
                  </Box>
                )}

                <Stack direction="row" spacing={2} sx={{ pt: 2 }}>
                  <Button variant="outlined" onClick={() => router.back()}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={
                      loading ? <CircularProgress size={20} /> : <SaveIcon />
                    }
                    disabled={busy || !canSubmit}
                  >
                    {loading ? "Recording..." : "Record Payment"}
                  </Button>
                </Stack>
              </Stack>
            </form>
          </Paper>

          {/* Invoice Summary (USD) */}
          <Card>
            <CardHeader title="Invoice Summary" subheader="Amounts in USD" />
            <Divider />
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Invoice Total
                  </Typography>
                  <CurrencyDisplay
                    value={invoice.totalAmount}
                    fontWeight="bold"
                  />
                </Box>

                {isSplitPayment && (
                  <>
                    <Divider />
                    <Box>
                      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
                        Hardware Sales
                      </Typography>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography color="textSecondary" variant="body2">
                          Already Paid
                        </Typography>
                        <CurrencyDisplay value={hardwarePaid} />
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography color="textSecondary" variant="body2">
                          Outstanding
                        </Typography>
                        <CurrencyDisplay value={hardwareOutstanding} />
                      </Stack>
                      {parts.length === 1 && (
                        <AmountDueInCurrency
                          usd={hardwareOutstanding}
                          account={parts[0]}
                          compact
                        />
                      )}
                    </Box>
                    <Box>
                      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
                        Hosting & Colocation
                      </Typography>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography color="textSecondary" variant="body2">
                          Already Paid
                        </Typography>
                        <CurrencyDisplay value={hostingPaid} />
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography color="textSecondary" variant="body2">
                          Outstanding
                        </Typography>
                        <CurrencyDisplay value={hostingOutstanding} />
                      </Stack>
                      {hostingParts.length === 1 && (
                        <AmountDueInCurrency
                          usd={hostingOutstanding}
                          account={hostingParts[0]}
                          compact
                        />
                      )}
                    </Box>
                  </>
                )}

                <Divider />

                <Box>
                  <Typography color="textSecondary" variant="body2">
                    Already Paid
                  </Typography>
                  <CurrencyDisplay value={paidAmount} fontWeight="bold" />
                </Box>

                <Divider />

                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
                    Outstanding (USD)
                  </Typography>
                  <CurrencyDisplay
                    value={outstandingAmount}
                    variant="h6"
                    fontWeight="bold"
                  />
                  {/* In the payment currency only while there's one currency
                    part (and, on the split form, one account for both). */}
                  {!isSplitPayment && parts.length === 1 && (
                    <AmountDueInCurrency
                      usd={outstandingAmount}
                      account={parts[0]}
                    />
                  )}
                </Box>

                {enteredTotal > 0 && enteredTotalUsd > 0 && (
                  <Box
                    sx={{
                      p: 1.5,
                      backgroundColor:
                        enteredTotalUsd > outstandingAmount
                          ? "#fff3cd"
                          : "#e8f5e9",
                      borderRadius: 1,
                    }}
                  >
                    <Typography color="textSecondary" variant="body2">
                      {enteredTotalUsd > outstandingAmount
                        ? "Positive Balance After Payment"
                        : "Remaining After Payment"}
                    </Typography>
                    <CurrencyDisplay
                      value={Math.abs(outstandingAmount - enteredTotalUsd)}
                      fontWeight="bold"
                    />
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Container>
    </DaylightThemedPage>
  );
}
