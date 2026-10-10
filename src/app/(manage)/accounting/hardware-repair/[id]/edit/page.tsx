"use client";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Stack,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useInvoice } from "@/lib/hooks/useInvoices";
import { useUpdateRepairInvoice } from "@/lib/hooks/useRepairInvoices";
import { RepairInvoiceForm } from "@/components/accounting/invoices/RepairInvoiceForm";

type RepairLineRow = {
  model: string;
  quantity: number;
  unitPrice: number | string;
};

const toDateInput = (value: string | Date) =>
  new Date(value).toISOString().split("T")[0];

export default function EditHardwareRepairInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const { invoice, loading } = useInvoice(invoiceId);
  const { update, loading: saving } = useUpdateRepairInvoice();

  const backHref = `/accounting/hardware-repair/${invoiceId}`;

  const header = (
    <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
      <Link href={backHref}>
        <Button startIcon={<ArrowBackIcon />}>Back to Invoice</Button>
      </Link>
      <Box flex={1}>
        <h1 style={{ margin: 0 }}>Edit Hardware Repair Invoice</h1>
        {invoice && (
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            {invoice.invoiceNumber}
          </p>
        )}
      </Box>
    </Stack>
  );

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!invoice || invoice.invoiceType !== "HARDWARE_REPAIR") {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        {header}
        <Alert severity="error">Hardware Repair invoice not found</Alert>
      </Container>
    );
  }

  if (invoice.status !== "DRAFT") {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        {header}
        <Alert severity="warning">Only DRAFT invoices can be edited.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {header}
      <RepairInvoiceForm
        mode="edit"
        initial={{
          customerId: invoice.userId,
          customerName: invoice.user?.name || invoice.user?.email || "",
          invoiceNumber: invoice.invoiceNumber,
          minerId: invoice.minerId ?? "",
          lineItems: (invoice.lineItems || []).map((li: RepairLineRow) => ({
            description: li.model,
            quantity: li.quantity,
            unitPrice: Number(li.unitPrice),
          })),
          discountAmount: Number(invoice.discountAmount),
          repairNote: invoice.repairNote?.note ?? "",
          dueDate: toDateInput(invoice.dueDate),
          machineHostingLocation: invoice.machineHostingLocation || [],
        }}
        submitting={saving}
        onCancel={() => router.push(backHref)}
        // The customer can't change on edit; the API ignores customerId.
        onSubmit={async (values) => {
          await update(invoiceId, values);
          router.push(backHref);
        }}
      />
    </Container>
  );
}
